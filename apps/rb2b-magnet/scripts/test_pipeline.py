"""End-to-end smoke test for the server-side lead magnet flow.

Verifies that signal-router can:
  1. Submit a scanner run for a given {name, company_website} via the public
     proxy at https://www.draftboard.com/api/scanner/submit (no reCAPTCHA
     needed for low-volume server-to-server, since the proxy only requires
     reCAPTCHA after rate-limiting on the same IP).
  2. Capture the leadHash + session cookie from the response.
  3. Poll the backend /summary endpoint until state=5 (Completed).
  4. Fetch /results to get the path-finding output (target prospects + path
     counts per target).
  5. Print everything for human review — no email sent, no DB writes.

If this script returns clean data without UI clicks, we know the deep query
runs as part of the standard pipeline and we don't need any browser
automation. If /results comes back empty, we'll need a fallback (e.g.
drive a CDP browser to advance through the gates).

Usage:
    python3 scripts/test_lead_magnet_flow.py "Stefania Kerrigan" "https://microblink.com"
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import requests


SUBMIT_URL = "https://www.draftboard.com/api/scanner/submit"
BACKEND_BASE = "https://intros.draftboard.com/api/v2/lead-magnet"

POLL_INTERVAL_SEC = 3.0
MAX_POLL_SECONDS = 240  # 4 min hard cap


def submit_scan(name: str, company_website: str, session: requests.Session) -> dict:
    """POST to the public proxy. Returns parsed JSON.

    Important: pass the existing session so set-cookie headers from the
    backend (forwarded through the Next.js proxy) are persisted for
    subsequent polls.
    """
    print(f"[submit] POST {SUBMIT_URL}")
    print(f"         name={name!r}  website={company_website!r}")
    r = session.post(
        SUBMIT_URL,
        json={"name": name, "companyWebsite": company_website},
        headers={
            "Content-Type": "application/json",
            "User-Agent": "signal-router/lead-magnet-test (zach@draftboard.com)",
        },
        timeout=20,
    )
    print(f"[submit] -> {r.status_code}")
    try:
        data = r.json()
    except Exception:
        print(f"[submit] non-JSON response body (first 500): {r.text[:500]}")
        raise SystemExit(1)

    if r.status_code != 200:
        print(f"[submit] FAILED. Response: {json.dumps(data, indent=2)[:1000]}")
        raise SystemExit(1)

    print(f"[submit] OK. leadHash={data.get('leadHash')}")
    if data.get("conversationId"):
        print(f"         conversationId={data['conversationId']}")
    if data.get("profile"):
        print(f"         profile={json.dumps(data['profile'])[:200]}")
    print(f"[submit] cookies after submit: {list(session.cookies.keys())}")
    return data


def get_user(lead_hash: str, session: requests.Session) -> dict:
    """Fetch the user record so we get the leadAuthToken some endpoints
    appear to use, AND to confirm the session is healthy."""
    url = f"{BACKEND_BASE}/user/{lead_hash}"
    print(f"[user] GET {url}")
    r = session.get(url, headers={"x-lead-magnet": "true"}, timeout=15)
    print(f"[user] -> {r.status_code}")
    if r.status_code != 200:
        print(f"[user] body: {r.text[:500]}")
        return {}
    data = r.json()
    print(f"[user] leadAuthToken={data.get('leadAuthToken', '(none)')[:30]}...")
    print(f"[user] conversationId={data.get('conversationId')}")
    return data


def poll_summary(session: requests.Session) -> dict | None:
    """Poll /summary until state=5 (Completed) or the run errors. Returns
    the final summary dict, or None on timeout."""
    url = f"{BACKEND_BASE}/summary"
    started = time.monotonic()
    poll_count = 0
    while time.monotonic() - started < MAX_POLL_SECONDS:
        poll_count += 1
        try:
            r = session.get(url, headers={"x-lead-magnet": "true"}, timeout=15)
        except Exception as e:
            print(f"[poll #{poll_count}] error: {e!r}")
            time.sleep(POLL_INTERVAL_SEC)
            continue
        if r.status_code != 200:
            print(f"[poll #{poll_count}] {r.status_code} — body: {r.text[:200]}")
            time.sleep(POLL_INTERVAL_SEC)
            continue
        data = r.json()
        run = data.get("run") or {}
        state = run.get("state")
        stage = run.get("stageLabel") or ""
        elapsed = int(time.monotonic() - started)
        print(f"[poll #{poll_count}] t={elapsed}s  state={state}  stage={stage!r}")
        if state == 5:
            print(f"[poll] DONE at {elapsed}s after {poll_count} polls")
            return data
        if state in (6, 7, 99):  # guess at error states; backend may differ
            print(f"[poll] terminal non-success state={state}")
            return data
        time.sleep(POLL_INTERVAL_SEC)
    print(f"[poll] TIMEOUT after {MAX_POLL_SECONDS}s")
    return None


def fetch_results(session: requests.Session) -> dict | None:
    """Pull /results. This is the path-finding output — targets array with
    per-target pathCount."""
    url = f"{BACKEND_BASE}/results"
    print(f"[results] GET {url}")
    r = session.get(url, headers={"x-lead-magnet": "true"}, timeout=20)
    print(f"[results] -> {r.status_code}")
    if r.status_code != 200:
        print(f"[results] body: {r.text[:500]}")
        return None
    return r.json()


def summarize(summary: dict, results: dict | None) -> None:
    """Print the personalization-relevant numbers and top accounts."""
    run = summary.get("run") or {}
    persona = run.get("persona") or {}
    titles = [t.get("title") for t in (persona.get("unifiedTitles") or [])]
    potential = run.get("potentialCustomers") or []
    current = run.get("currentCustomers") or []

    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    print(f"Company:        {run.get('companyName')}")
    print(f"Description:    {run.get('companyDescription', '')[:140]}")
    print(f"ICP:            {persona.get('description', '')[:140]}")
    print(f"Buyer Titles:   {' / '.join(titles)}")
    print(f"Identified Customers ({len(current)}): {[c.get('companyName') for c in current][:8]}")
    print(f"Dream Accounts ({len(potential)}): {[c.get('companyName') for c in potential][:10]}")

    if not results:
        print("\n*** /results endpoint returned nothing — fallback needed ***")
        return

    targets = (results.get("results") or {}).get("targets") or []
    if not targets:
        print("\n*** /results returned but targets array is empty ***")
        return

    total_paths = sum(int(t.get("pathCount") or 0) for t in targets)
    by_company: dict[str, int] = {}
    for t in targets:
        positions = t.get("profile", {}).get("positions") or []
        main = next((p for p in positions if p.get("main")), positions[0] if positions else {})
        company = (main.get("company") or {}).get("name") or "Other"
        by_company[company] = by_company.get(company, 0) + int(t.get("pathCount") or 0)

    print(f"\nTotal warm-intro paths: {total_paths}")
    print(f"Target prospects: {len(targets)}")
    print(f"Companies hit: {len(by_company)}")
    print("\nTop 5 companies by path count:")
    for company, paths in sorted(by_company.items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  {paths:>4}  {company}")
    print("\nTop 5 individual prospects by path count:")
    for t in sorted(targets, key=lambda x: int(x.get("pathCount") or 0), reverse=True)[:5]:
        prof = t.get("profile") or {}
        positions = prof.get("positions") or []
        main = next((p for p in positions if p.get("main")), positions[0] if positions else {})
        company = (main.get("company") or {}).get("name") or "?"
        title = main.get("title") or "?"
        name = f"{prof.get('firstName', '')} {prof.get('lastName', '')}".strip() or "?"
        print(f"  {int(t.get('pathCount') or 0):>4}  {name:<30} {title} @ {company}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("name", help="Visitor's full name (e.g. 'Stefania Kerrigan')")
    p.add_argument("company_website",
                   help="Visitor's company website (e.g. 'https://microblink.com')")
    args = p.parse_args()

    session = requests.Session()

    submit_data = submit_scan(args.name, args.company_website, session)
    lead_hash = submit_data.get("leadHash")
    if not lead_hash:
        print("[fatal] no leadHash returned, can't continue")
        return 1

    # Mirror the frontend: hit /user/{leadHash} once before polling. This
    # may be what kicks the backend into running the deep query — the
    # frontend's ScannerPage does this in init() before pollSummary().
    get_user(lead_hash, session)

    summary = poll_summary(session)
    if not summary:
        print("[fatal] summary never reached terminal state")
        return 1

    results = fetch_results(session)

    summarize(summary, results)

    print(f"\nDeep-link URL (no extension version, skip gates):")
    print(f"  https://www.draftboard.com/scanner/{lead_hash}?direct=1")
    print(f"\n(Note: ?direct=1 only works after PR #22 merges. Without it, the URL")
    print(f" still works but visitor lands on the 'Here's what we found' confirm gate first.)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
