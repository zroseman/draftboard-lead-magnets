"""Smoke test for the quality-check agent.

Runs check_scanner_output() against:
  1. A "good" synthetic ScannerOutput (Bambuser → livestream commerce →
     retail brands) — should return 'send' with high confidence.
  2. A "bad" synthetic ScannerOutput (Bambuser → completely wrong ICP
     and wrong dream accounts) — should return 'skip' or 'review' with
     issues flagged.
  3. (Optional) A real run if a name + website is passed as args.

Usage:
    python3 scripts/test_quality_check.py
    python3 scripts/test_quality_check.py "Mario Garunrangseewong" "https://bambuser.com"
"""

from __future__ import annotations

import argparse
import sys

# Make the parent dir importable when invoked from scripts/.
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))

from pipeline import ScannerOutput, run_scanner_for_visitor
from quality_check import check_scanner_output


def _print_result(label: str, result) -> None:
    print(f"\n=== {label} ===")
    if result is None:
        print("FAILED — no result returned (auth/network/parse issue).")
        return
    print(f"recommendation:    {result.recommendation}")
    print(f"confidence:        {result.confidence}")
    print(f"company assessment: {result.company_assessment}")
    print(f"rationale:         {result.rationale}")
    if result.issues:
        print(f"issues flagged:")
        for i in result.issues:
            print(f"  - {i}")
    else:
        print("issues flagged:    (none)")


# ---------- Synthetic GOOD case (Bambuser livestream commerce → retail) ----

GOOD = ScannerOutput(
    lead_hash="test-good",
    conversation_id=None,
    company_name="Bambuser",
    company_description=(
        "Bambuser is a livestream and video commerce platform that helps "
        "retail brands engage shoppers through interactive shopping shows, "
        "shoppable videos, and one-to-one consultations."
    ),
    icp_description=(
        "Mid-to-large retail and e-commerce brands looking to increase "
        "engagement and conversion through interactive video shopping."
    ),
    buyer_titles=[
        "VP of E-commerce", "Head of Digital", "Director of Marketing",
        "Chief Digital Officer", "Head of Customer Experience",
    ],
    dream_accounts=[
        "Ralph Lauren", "Nordstrom", "Ulta", "Sephora", "Macy's",
        "Lululemon", "Gap", "H&M", "Bloomingdale's", "Zara",
    ],
    total_paths=237,
    target_count=10,
    top_companies_by_paths=[
        ("KidStrong", 74), ("Ulta", 46), ("Starbucks", 33),
        ("Nordstrom", 30), ("Victoria's Secret", 19),
    ],
    top_prospects=[
        {"name": "Katie Mitchell", "title": "SVP, Marketing & Growth",
         "company": "Ralph Lauren", "path_count": 88},
        {"name": "Darshan Gad", "title": "VP, Brand Marketing",
         "company": "KidStrong", "path_count": 74},
        {"name": "Mike Maresca", "title": "Director of Digital",
         "company": "Ulta", "path_count": 55},
    ],
)

# ---------- Synthetic BAD case (Bambuser misclassified as B2B SaaS) -------

BAD = ScannerOutput(
    lead_hash="test-bad",
    conversation_id=None,
    company_name="Bambuser",
    company_description=(
        "Bambuser is a B2B SaaS platform that provides cybersecurity "
        "solutions to financial institutions for fraud detection and "
        "regulatory compliance."  # WRONG — Bambuser is video commerce
    ),
    icp_description=(
        "Large enterprise banks and insurance companies in regulated "
        "markets needing compliance automation and fraud prevention."
    ),
    buyer_titles=[
        "Chief Information Security Officer", "VP of Risk",
        "Head of Compliance", "Chief Risk Officer",
    ],
    dream_accounts=[
        "JPMorgan Chase", "Goldman Sachs", "Bank of America",
        "Wells Fargo", "Citi", "Morgan Stanley", "Deutsche Bank",
    ],
    total_paths=200,
    target_count=10,
    top_companies_by_paths=[
        ("JPMorgan Chase", 60), ("Goldman Sachs", 45),
        ("Citi", 40), ("Wells Fargo", 30),
    ],
    top_prospects=[
        {"name": "Jane Banker", "title": "CISO",
         "company": "JPMorgan Chase", "path_count": 60},
        {"name": "Bob Compliance", "title": "VP of Risk",
         "company": "Goldman Sachs", "path_count": 45},
    ],
)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("name", nargs="?", default=None)
    p.add_argument("website", nargs="?", default=None)
    args = p.parse_args()

    print("Running quality-check agent against synthetic GOOD scanner output (Bambuser correctly classified)...")
    good_result = check_scanner_output(GOOD)
    _print_result("GOOD: Bambuser as retail livestream commerce", good_result)

    print("\nRunning against synthetic BAD scanner output (Bambuser misclassified as cybersecurity)...")
    bad_result = check_scanner_output(BAD)
    _print_result("BAD: Bambuser misclassified as cybersecurity SaaS", bad_result)

    if args.name and args.website:
        print(f"\n\nRunning against REAL pipeline output for {args.name} / {args.website}...")
        live = run_scanner_for_visitor(args.name, args.website)
        if live:
            real_result = check_scanner_output(live)
            _print_result(f"LIVE: {args.name} / {args.website}", real_result)

    print("\n\nExpected:")
    print("  GOOD case -> 'send' with high confidence, 0 issues")
    print("  BAD case  -> 'skip' (or 'review') with issues flagged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
