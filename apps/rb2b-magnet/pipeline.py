"""RB2B → Draftboard scanner → personalized warm-intro email.

For each tier-1/2 RB2B visitor with a valid email, we run their company
through Draftboard's existing scanner pipeline (the same one that powers
draftboard.com/scanner) server-side, then send a personalized cold email
with the warm-intro stats we found.

The email is link-free by design — we don't include the personalized
URL in the cold email body to avoid ESP spam-flagging. When the
recipient replies, Zach (or a follow-up automation) sends the
/scanner/{leadHash}?direct=1 URL in the reply.

Pipeline:
  1. POST /api/scanner/submit  → leadHash + conversationId + profile
  2. GET /lead-magnet/user/{leadHash}  → leadAuthToken (warms up state)
  3. Poll /lead-magnet/summary until run.state == 5 (Completed)
  4. GET /lead-magnet/results  → targets with pathCounts
  5. Render the locked email template with per-visitor data
  6. Send via Gmail (or store as draft for review)

Voice rules per Zach's CLAUDE.md:
  - Normal capitalization (it's an email, not LinkedIn)
  - Hyphen-after-name greeting, no comma ("Dave -")
  - No em-dashes, no AI vocabulary
  - "Founder of Draftboard" sign-off

Public API:
  - run_scanner_for_visitor(name, company_website) -> ScannerOutput | None
  - compose_email(visitor, scanner_output) -> str  (body, plain text)
  - compose_subject(visitor, scanner_output) -> str
  - send_or_draft(to_email, subject, body, dry_run) -> dict
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import requests


SUBMIT_URL = "https://www.draftboard.com/api/scanner/submit"
BACKEND_BASE = "https://intros.draftboard.com/api/v2/lead-magnet"
PUBLIC_BASE = "https://www.draftboard.com"

POLL_INTERVAL_SEC = 3.0
MAX_POLL_SECONDS = 240  # 4 min hard cap; typical run is ~60-90s


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ScannerOutput:
    """Everything we need to compose an email and the deep-link URL."""
    lead_hash: str
    conversation_id: Optional[str]
    company_name: str
    company_description: str
    icp_description: str
    buyer_titles: List[str]
    dream_accounts: List[str]            # AI-generated, aspirational
    total_paths: int                     # sum of pathCounts
    target_count: int                    # number of unique prospects
    top_companies_by_paths: List[Tuple[str, int]]  # (company_name, total_paths)
    top_prospects: List[Dict]            # [{name, title, company, path_count}, ...]

    @property
    def deep_link_url(self) -> str:
        """The URL we'll send when the recipient replies. ?direct=1 skips
        the ICP-confirm gate AND the picker step, dropping them straight
        on /scanner-results. Requires PR #22 to be merged (else they'll
        see the confirm gate, which is fine — one extra click)."""
        return f"{PUBLIC_BASE}/scanner/{self.lead_hash}?direct=1"


# ---------------------------------------------------------------------------
# Scanner pipeline (server-side)
# ---------------------------------------------------------------------------

def _submit(name: str, company_website: str, session: requests.Session) -> Dict:
    """Hit the public proxy. Returns parsed response on success or {}."""
    try:
        r = session.post(
            SUBMIT_URL,
            json={"name": name, "companyWebsite": company_website},
            headers={
                "Content-Type": "application/json",
                "User-Agent": "signal-router/lead-magnet (zach@draftboard.com)",
            },
            timeout=20,
        )
    except Exception as e:
        print(f"[lead_magnet] submit network error: {e!r}")
        return {}
    if r.status_code != 200:
        print(f"[lead_magnet] submit failed: {r.status_code} {r.text[:300]}")
        return {}
    try:
        return r.json()
    except Exception:
        return {}


def _warm_user(lead_hash: str, session: requests.Session) -> None:
    """Frontend hits /user/{leadHash} once before polling — mirror that."""
    try:
        session.get(
            f"{BACKEND_BASE}/user/{lead_hash}",
            headers={"x-lead-magnet": "true"},
            timeout=15,
        )
    except Exception:
        pass


def _poll_summary(session: requests.Session) -> Optional[Dict]:
    """Poll /summary until state=5 (Completed) or terminal failure.
    Returns the parsed summary dict, or None on timeout."""
    started = time.monotonic()
    last_state = None
    while time.monotonic() - started < MAX_POLL_SECONDS:
        try:
            r = session.get(
                f"{BACKEND_BASE}/summary",
                headers={"x-lead-magnet": "true"},
                timeout=15,
            )
        except Exception:
            time.sleep(POLL_INTERVAL_SEC)
            continue
        if r.status_code != 200:
            time.sleep(POLL_INTERVAL_SEC)
            continue
        data = r.json()
        run = data.get("run") or {}
        state = run.get("state")
        if state != last_state:
            elapsed = int(time.monotonic() - started)
            print(f"[lead_magnet] t={elapsed}s state={state} stage={run.get('stageLabel')!r}")
            last_state = state
        if state == 5:
            return data
        # State codes 6/7/99 are guesses for error states. Backend's
        # exact taxonomy isn't documented, so log and bail on any
        # state that isn't 1-5 (the known-good progress states).
        if isinstance(state, int) and state not in (1, 2, 3, 4, 5):
            print(f"[lead_magnet] terminal non-success state={state}, stopping poll")
            return data
        time.sleep(POLL_INTERVAL_SEC)
    print(f"[lead_magnet] poll timeout after {MAX_POLL_SECONDS}s")
    return None


def _fetch_results_once(session: requests.Session) -> Optional[Dict]:
    try:
        r = session.get(
            f"{BACKEND_BASE}/results",
            headers={"x-lead-magnet": "true"},
            timeout=20,
        )
    except Exception as e:
        print(f"[lead_magnet] results error: {e!r}")
        return None
    if r.status_code != 200:
        print(f"[lead_magnet] results failed: {r.status_code} {r.text[:200]}")
        return None
    return r.json()


def _fetch_results(session: requests.Session,
                   poll_interval: float = 15.0,
                   max_wait_sec: float = 150.0) -> Optional[Dict]:
    """Poll /results until two consecutive fetches return the same total
    pathCount, OR we hit max_wait_sec. The backend sets state=5 when the
    summary is ready, but path-finding continues async for ~30-60s after,
    populating /results in batches. Empirically (debug_results_variance.py
    on 2026-05-03) the populate window completes within ~45s of state=5;
    we cap at 150s as a safety belt. Returns the final stable results,
    or whatever the last successful fetch returned on timeout."""
    last_results: Optional[Dict] = None
    last_total: Optional[int] = None
    started = time.monotonic()
    fetch_count = 0
    while time.monotonic() - started < max_wait_sec:
        results = _fetch_results_once(session)
        fetch_count += 1
        if results is None:
            time.sleep(poll_interval)
            continue
        targets = (results.get("results") or {}).get("targets") or []
        total = sum(int(t.get("pathCount") or 0) for t in targets)
        elapsed = int(time.monotonic() - started)
        print(f"[lead_magnet] /results fetch #{fetch_count} t+{elapsed}s "
              f"targets={len(targets)} paths={total}")
        if last_total is not None and total == last_total:
            print(f"[lead_magnet] /results stable at {total} paths after {elapsed}s")
            return results
        last_results = results
        last_total = total
        time.sleep(poll_interval)
    if last_results is not None:
        print(f"[lead_magnet] /results never stabilized in {max_wait_sec}s; "
              f"returning last fetch (paths={last_total})")
    return last_results


def _main_position(profile: Dict) -> Dict:
    positions = profile.get("positions") or []
    return next((p for p in positions if p.get("main")), positions[0] if positions else {})


_JUNK_COMPANY_PATTERNS = [
    # Starts with a dot or has dots before letters — usually a URL or
    # event slug like '.conf26' or '.tech'.
    lambda s: s.startswith("."),
    # All-numeric or mostly punctuation.
    lambda s: not any(c.isalpha() for c in s),
    # Very short (e.g., 'X' alone is rarely a real B2B account name we'd
    # want to feature).
    lambda s: len(s.strip()) < 3,
    # Conference-y patterns: 'KubeCon', 'ReactConf', '.conf', etc. We let
    # legit '...con' brands through (Verizon, Falcon) by anchoring on
    # short stems with 'conf' suffix.
    lambda s: s.lower().endswith(("conf", ".conf", "conference")),
    # URL-shaped.
    lambda s: "/" in s or s.startswith(("http", "www.")),
]


def _clean_company_name(name: str) -> Optional[str]:
    """Strip parentheticals and basic junk from a company name. Returns
    None if the name should be filtered out entirely."""
    if not name:
        return None
    cleaned = name.strip()
    # Strip trailing parenthetical: 'Freshworks Inc. (formerly Freshdesk)' ->
    # 'Freshworks Inc.'
    paren_idx = cleaned.find("(")
    if paren_idx > 0:
        cleaned = cleaned[:paren_idx].strip()
    # Strip trailing 'Inc.', 'LLC', etc. — keeps the email tighter.
    for suffix in (" Inc.", " Inc", " LLC", " Ltd.", " Ltd", " Corp.", " Corp"):
        if cleaned.endswith(suffix):
            cleaned = cleaned[: -len(suffix)].strip()
            break
    if not cleaned:
        return None
    for pat in _JUNK_COMPANY_PATTERNS:
        if pat(cleaned):
            return None
    return cleaned


def _summarize_results(results: Dict) -> Tuple[int, int, List[Tuple[str, int]], List[Dict]]:
    """Returns (total_paths, target_count, top_companies, top_prospects).

    `top_companies` is filtered for junk and cleaned (parentheticals
    stripped, corporate suffixes dropped). `total_paths` and `target_count`
    are computed BEFORE filtering since they represent the raw scanner
    output the visitor would see on /scanner-results.
    """
    targets = (results.get("results") or {}).get("targets") or []
    if not targets:
        return 0, 0, [], []

    total_paths = sum(int(t.get("pathCount") or 0) for t in targets)

    by_company: Dict[str, int] = {}
    for t in targets:
        prof = t.get("profile") or {}
        raw_company = (_main_position(prof).get("company") or {}).get("name") or "Other"
        company = _clean_company_name(raw_company)
        if not company:
            continue
        by_company[company] = by_company.get(company, 0) + int(t.get("pathCount") or 0)

    top_companies = sorted(by_company.items(), key=lambda x: x[1], reverse=True)

    top_prospects: List[Dict] = []
    for t in sorted(targets, key=lambda x: int(x.get("pathCount") or 0), reverse=True)[:10]:
        prof = t.get("profile") or {}
        main = _main_position(prof)
        top_prospects.append({
            "name": f"{prof.get('firstName', '')} {prof.get('lastName', '')}".strip(),
            "title": main.get("title") or "",
            "company": (main.get("company") or {}).get("name") or "",
            "path_count": int(t.get("pathCount") or 0),
        })

    return total_paths, len(targets), top_companies, top_prospects


def run_scanner_for_visitor(name: str, company_website: str) -> Optional[ScannerOutput]:
    """End-to-end: submit + warm + poll + results. Returns ScannerOutput
    or None on failure. Prints progress to stdout. Safe to call repeatedly
    for the same visitor — each call creates a fresh leadHash, but the
    backend dedups on company + email, so wasted work is bounded."""
    session = requests.Session()

    submit_data = _submit(name, company_website, session)
    lead_hash = submit_data.get("leadHash")
    if not lead_hash:
        return None

    _warm_user(lead_hash, session)

    summary = _poll_summary(session)
    if not summary:
        return None

    results = _fetch_results(session) or {}

    run = summary.get("run") or {}
    persona = run.get("persona") or {}
    titles = [t.get("title") for t in (persona.get("unifiedTitles") or []) if t.get("title")]
    potential = [c.get("companyName") for c in (run.get("potentialCustomers") or []) if c.get("companyName")]

    total_paths, target_count, top_companies, top_prospects = _summarize_results(results)

    return ScannerOutput(
        lead_hash=lead_hash,
        conversation_id=submit_data.get("conversationId"),
        company_name=run.get("companyName") or "",
        company_description=run.get("companyDescription") or "",
        icp_description=persona.get("description") or "",
        buyer_titles=titles,
        dream_accounts=potential,
        total_paths=total_paths,
        target_count=target_count,
        top_companies_by_paths=top_companies,
        top_prospects=top_prospects,
    )


# ---------------------------------------------------------------------------
# Email rendering
# ---------------------------------------------------------------------------

def _format_titles(titles: List[str]) -> str:
    """Pick the top 1-2 buyer titles and present them naturally.

    Examples:
      ['VP of Sales']                              -> 'VPs of Sales'
      ['CTO', 'VP of Compliance']                  -> 'CTOs and VPs of Compliance'
      ['Head of Marketing', 'Director of Demand']  -> 'Heads of Marketing'
    """
    if not titles:
        return "senior buyers"
    primary = titles[0]
    # Pluralize the role if it makes sense
    plural = primary
    lower = primary.lower()
    if lower.startswith(("chief ", "head of", "vp of", "director of",
                          "vp,", "head ", "vp ")):
        # 'Chief Technology Officer' -> 'CTOs', 'Head of Risk' -> 'Heads of Risk', etc.
        if lower.startswith("chief "):
            # acronymize: 'Chief X Officer' -> 'CXOs'
            words = primary.split()
            if len(words) >= 3 and words[-1].lower() == "officer":
                plural = "C" + "".join(w[0].upper() for w in words[1:-1]) + "Os"
            else:
                plural = primary + "s"
        elif lower.startswith("head of"):
            plural = "Heads of" + primary[len("Head of"):]
        elif lower.startswith("vp of"):
            plural = "VPs of" + primary[len("VP of"):]
        elif lower.startswith("vp,"):
            plural = "VPs," + primary[len("VP,"):]
        elif lower.startswith("vp "):
            plural = "VPs " + primary[len("VP "):]
        elif lower.startswith("director of"):
            plural = "Directors of" + primary[len("Director of"):]
        else:
            plural = primary + "s"
    else:
        plural = primary + "s"
    return plural


def _format_companies(top_companies: List[Tuple[str, int]], k: int = 3) -> str:
    """Top-k company names by path count, comma-separated with 'and'.

    Examples:
      [('N26',18), ('Citi',13)]          -> 'N26 and Citi'
      [('N26',18), ('Citi',13), ('HSBC',7)] -> 'N26, Citi, and HSBC'
    """
    names = [c for c, _ in top_companies[:k]]
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return ", ".join(names[:-1]) + f", and {names[-1]}"


def _first_name(full_name: str) -> str:
    full_name = (full_name or "").strip()
    return full_name.split()[0] if full_name else ""


# Cap the displayed paths-per-target ratio. Per Zach: "more than 15 to 1
# of paths to targets... people will disregard it as noise." So if the
# top-N prospects have more than 15 paths each on average, we display the
# capped number with "more than" framing instead of the raw sum.
_MAX_PATHS_PER_TARGET = 15
_DEFAULT_TOP_N = 10


def compute_advertised_paths(
    top_prospects: List[Dict],
    top_n: int = _DEFAULT_TOP_N,
    ratio_cap: int = _MAX_PATHS_PER_TARGET,
) -> Tuple[int, int, bool]:
    """Returns (display_paths, target_count, is_capped).

    Takes the top `top_n` prospects by pathCount. Computes the sum of
    their paths. If the per-target ratio exceeds `ratio_cap`, caps the
    displayed number at `ratio_cap * target_count` and returns is_capped
    True so the email uses "more than X" framing.

    Example: top 10 prospects with 456 paths total -> ratio 45.6 ->
    capped at 150 -> email says "more than 150 paths to your top 10".
    """
    top = top_prospects[:top_n]
    target_count = len(top)
    if target_count == 0:
        return 0, 0, False
    total = sum(int(p.get("path_count") or 0) for p in top)
    ratio = total / target_count
    if ratio > ratio_cap:
        return ratio_cap * target_count, target_count, True
    return total, target_count, False


def compose_email(visitor_name: str, scanner: ScannerOutput) -> str:
    """Render the locked email template with per-visitor data.

    Framing per Zach (2026-05-03):
      - Don't lead with raw total_paths (variance + scale make it feel
        spammy). Use top-N prospects with 15:1 ratio cap.
      - Anchor on named accounts (top 3 by path count) for credibility.
      - "Your own network probably has more" pivots to the install-extension
        upsell that lives on the deep-link page.

    Voice rules (Zach's CLAUDE.md):
      - Normal capitalization
      - Hyphen-after-name greeting, no comma
      - No em-dashes (use hyphens for the dash effect)
      - 'Founder of Draftboard' sign-off
    """
    first = _first_name(visitor_name) or visitor_name or "there"
    company = scanner.company_name or "your company"
    companies_str = _format_companies(scanner.top_companies_by_paths, k=3)

    paths_display, target_count, is_capped = compute_advertised_paths(scanner.top_prospects)

    if target_count == 0:
        # No targets at all — pipeline thin. Fall back to a generic line
        # and let the recipient explore via the URL on reply.
        paths_phrase = f"warm intros to {_format_titles(scanner.buyer_titles)}"
    elif is_capped:
        paths_phrase = (f"more than {paths_display} warm intros to your top "
                        f"{target_count} prospects")
    else:
        paths_phrase = (f"{paths_display} warm intros to your top "
                        f"{target_count} prospects")

    if scanner.top_companies_by_paths and len(scanner.top_companies_by_paths) >= 2:
        accounts_phrase = f" at companies like {companies_str}"
    elif scanner.dream_accounts:
        # Fall back to dream accounts for the named-companies tail when
        # the path-finding didn't surface enough distinct companies.
        fallback = scanner.dream_accounts[:3]
        if len(fallback) == 1:
            accounts_phrase = f" at companies like {fallback[0]}"
        else:
            joined = ", ".join(fallback[:-1]) + f", and {fallback[-1]}"
            accounts_phrase = f" at companies like {joined}"
    else:
        accounts_phrase = ""

    body = (
        f"{first} -\n"
        f"\n"
        f"We ran {company} through our network and mapped {paths_phrase}{accounts_phrase}.\n"
        f"\n"
        f"Your own network probably has more. Reply here and I'll send you the "
        f"personalized scan we already pulled for you.\n"
        f"\n"
        f"Thanks,\n"
        f"Zach\n"
        f"Founder of Draftboard\n"
        f"\n"
        f"(not interested? just reply 'no thanks' and i'll take you off the list.)\n"
    )
    return body


def compose_subject(visitor_name: str, scanner: ScannerOutput) -> str:
    """Subject line. Mirrors the body's capped-paths framing so subject
    and body agree on the number. Avoids urgency triggers."""
    first = _first_name(visitor_name)
    paths_display, target_count, is_capped = compute_advertised_paths(scanner.top_prospects)
    if target_count == 0:
        body_lead = "warm paths into your ICP"
    elif is_capped:
        body_lead = f"{paths_display}+ warm paths to your top {target_count} prospects"
    else:
        body_lead = f"{paths_display} warm paths to your top {target_count} prospects"
    if first:
        return f"{first}, found {body_lead}"
    return f"Found {body_lead}"
