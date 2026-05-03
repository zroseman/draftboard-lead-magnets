"""Debug: is /results stable after the run reaches state=5, or does it
keep populating asynchronously?

Hypothesis: when the backend reports stage='Completed' (state=5), it may
mean "summary is ready" — but path-finding may continue populating
/results in the background. If true, our pipeline fetches /results too
eagerly and gets partial data. The "variance" between runs would then
just be: each run fetches at a different point in the post-completion
populate window.

Test:
  1. Fresh submit (new test lead).
  2. Poll /summary until state=5.
  3. Capture /results immediately (T0) + at T+15s, T+45s, T+105s, T+225s.
  4. Print path counts and per-prospect counts at each capture.

If counts grow over time -> we're polling /results too early. Fix:
poll /results until it stabilizes (e.g., 2 consecutive identical totals).

If counts are stable -> the variance is real backend non-determinism
on identical input. Then we'd want to run a second test (re-submit
same input later) to confirm the cross-run variance.

Usage:
    python3 scripts/debug_results_variance.py "Mario Garunrangseewong" "https://bambuser.com"
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import requests


SUBMIT_URL = "https://www.draftboard.com/api/scanner/submit"
BACKEND_BASE = "https://intros.draftboard.com/api/v2/lead-magnet"


def submit(name: str, website: str, session: requests.Session) -> str | None:
    r = session.post(
        SUBMIT_URL,
        json={"name": name, "companyWebsite": website},
        headers={"Content-Type": "application/json",
                 "User-Agent": "rb2b-magnet/debug"},
        timeout=20,
    )
    print(f"[submit] -> {r.status_code}")
    if r.status_code != 200:
        print(f"[submit] body: {r.text[:300]}")
        return None
    return r.json().get("leadHash")


def warm_user(lead_hash: str, session: requests.Session) -> None:
    session.get(
        f"{BACKEND_BASE}/user/{lead_hash}",
        headers={"x-lead-magnet": "true"},
        timeout=15,
    )


def poll_summary(session: requests.Session) -> tuple[float, dict | None]:
    """Returns (seconds_to_completed, summary). Polls every 3s up to 4min."""
    start = time.monotonic()
    last_state = None
    while time.monotonic() - start < 240:
        try:
            r = session.get(
                f"{BACKEND_BASE}/summary",
                headers={"x-lead-magnet": "true"},
                timeout=15,
            )
            if r.status_code != 200:
                time.sleep(3)
                continue
            data = r.json()
            run = data.get("run") or {}
            state = run.get("state")
            if state != last_state:
                elapsed = time.monotonic() - start
                print(f"[poll] t={elapsed:.1f}s state={state} stage={run.get('stageLabel')!r}")
                last_state = state
            if state == 5:
                return time.monotonic() - start, data
        except Exception as e:
            print(f"[poll] error: {e!r}")
        time.sleep(3)
    return -1, None


def fetch_results(session: requests.Session) -> dict | None:
    r = session.get(
        f"{BACKEND_BASE}/results",
        headers={"x-lead-magnet": "true"},
        timeout=20,
    )
    if r.status_code != 200:
        return None
    return r.json()


def summarize_results(results: dict) -> dict:
    targets = (results.get("results") or {}).get("targets") or []
    by_prospect = {}
    for t in targets:
        prof = t.get("profile") or {}
        positions = prof.get("positions") or []
        main = next((p for p in positions if p.get("main")), positions[0] if positions else {})
        company = (main.get("company") or {}).get("name") or "?"
        name = f"{prof.get('firstName', '')} {prof.get('lastName', '')}".strip() or "?"
        by_prospect[f"{name} @ {company}"] = int(t.get("pathCount") or 0)
    total = sum(by_prospect.values())
    return {
        "target_count": len(targets),
        "total_paths": total,
        "per_prospect": by_prospect,
    }


def diff_summaries(before: dict, after: dict) -> str:
    out = []
    if before["target_count"] != after["target_count"]:
        out.append(f"target_count: {before['target_count']} -> {after['target_count']}")
    if before["total_paths"] != after["total_paths"]:
        out.append(f"total_paths: {before['total_paths']} -> {after['total_paths']}")
    new_keys = set(after["per_prospect"]) - set(before["per_prospect"])
    if new_keys:
        out.append(f"new prospects: {sorted(new_keys)}")
    changed = []
    for k in sorted(set(before["per_prospect"]) & set(after["per_prospect"])):
        b, a = before["per_prospect"][k], after["per_prospect"][k]
        if b != a:
            changed.append(f"{k}: {b} -> {a}")
    if changed:
        out.append("changed prospects:\n  " + "\n  ".join(changed))
    return "\n".join(out) if out else "(no change)"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("name")
    p.add_argument("website")
    args = p.parse_args()

    print(f"\n=== DEBUG: {args.name} / {args.website} ===\n")

    session = requests.Session()

    lead_hash = submit(args.name, args.website, session)
    if not lead_hash:
        return 1
    print(f"[submit] leadHash={lead_hash}\n")

    warm_user(lead_hash, session)

    elapsed_to_5, summary = poll_summary(session)
    if not summary:
        print("[poll] never reached state=5")
        return 1

    print(f"\n[poll] state=5 reached at t={elapsed_to_5:.1f}s after submit\n")

    # Snapshots: at T+0s (immediately on Completed), T+15s, T+45s, T+105s, T+225s
    delays = [0, 15, 30, 60, 120]  # cumulative gap from previous fetch
    snapshots: list[tuple[float, dict]] = []
    cumulative = 0.0
    for delay in delays:
        if delay:
            print(f"[wait] sleeping {delay}s before next /results fetch...")
            time.sleep(delay)
        cumulative += delay
        results = fetch_results(session)
        if results is None:
            print(f"[fetch t+{cumulative:.0f}s] /results returned None")
            continue
        s = summarize_results(results)
        print(f"[fetch t+{cumulative:.0f}s after Completed] "
              f"target_count={s['target_count']}  total_paths={s['total_paths']}")
        snapshots.append((cumulative, s))

    print("\n" + "=" * 60)
    print("DELTA ANALYSIS")
    print("=" * 60)
    for i in range(1, len(snapshots)):
        t_a, snap_a = snapshots[i - 1]
        t_b, snap_b = snapshots[i]
        print(f"\n--- t+{t_a:.0f}s -> t+{t_b:.0f}s ---")
        print(diff_summaries(snap_a, snap_b))

    print("\n" + "=" * 60)
    print("FINAL SNAPSHOT (t+{:.0f}s)".format(snapshots[-1][0]))
    print("=" * 60)
    final = snapshots[-1][1]
    print(f"Target count: {final['target_count']}")
    print(f"Total paths:  {final['total_paths']}")
    print(f"Ratio:        {final['total_paths'] / max(final['target_count'], 1):.1f} paths/target")
    print(f"\nTop 10 prospects by path count:")
    for k, v in sorted(final["per_prospect"].items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {v:>5}  {k}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
