"""LLM-based quality gate for scanner output.

The Draftboard scanner pipeline sometimes hallucinates: wrong ICP, wrong
buyer titles, irrelevant dream accounts, junk company names. Sending a
cold email built on bad scanner output is worse than not sending — it
makes us look unhinged ("we mapped paths to Heads of Marketing" when
their real buyers are "Head of Risk").

This module sits between pipeline.run_scanner_for_visitor() and email
send. For each visitor:
  1. Take the scanner's output (company name, description, ICP, buyer
     titles, dream accounts, top prospects).
  2. Ask Claude to evaluate whether the interpretation is plausible
     given what's known about the visitor's actual company.
  3. Return a structured pass/fail with confidence + flagged issues.

Skips email send entirely if the check fails. No DM to Zach about
failures (just logged) — the goal is to silently filter out bad
scanner outputs, not surface noise.

Cost: a few cents per check (Sonnet 4.6, ~3-4K tokens). Latency: ~5-10s.
Worth it given the alternative is a fraction of emails sounding broken.

ANTHROPIC_API_KEY is read from env or ~/.draftboard-secrets/ai.env.
"""

from __future__ import annotations

import os
import sys
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


MODEL_ID = "claude-sonnet-4-6"


# ---------- Pydantic schema for the check result ----------

class QualityCheckResult(BaseModel):
    recommendation: Literal["send", "skip", "review"] = Field(
        description=(
            "send: scanner output is plausible, OK to email this prospect. "
            "skip: scanner output has obvious problems (wrong industry, "
            "hallucinated ICP, junk targets) that would make the email "
            "embarrassing. Don't email and don't surface to user. "
            "review: borderline — flag for human review before sending."
        )
    )
    confidence: int = Field(
        description="0-100. How confident you are in your recommendation. "
                    "100 = obvious; 50 = genuinely uncertain.",
        ge=0,
        le=100,
    )
    issues: List[str] = Field(
        default_factory=list,
        description=(
            "Specific problems you found, one per item. Examples: "
            "'ICP description mentions B2C but company website is clearly B2B', "
            "'Top prospect is at a university (Ohio State) which is not a "
            "real B2B target for this company', "
            "'Dream accounts are mostly enterprise banks but the company "
            "sells to small e-commerce shops'. "
            "Empty list if everything checks out."
        ),
    )
    company_assessment: str = Field(
        description=(
            "One sentence about what the visitor's company actually does, "
            "based on their company name + website domain. Use your "
            "general knowledge. If you don't know the company, say so."
        )
    )
    rationale: str = Field(
        description="One short paragraph explaining your recommendation. "
                    "Concrete, specific. No filler."
    )


# ---------- system prompt ----------

SYSTEM_PROMPT = """\
You are a quality reviewer for an automated cold-email lead-magnet system at
Draftboard. Draftboard is a B2B platform that maps warm-intro paths through a
user's professional network to their target prospects.

A separate AI pipeline (the 'scanner') analyzes a visitor's company website
and predicts: their ideal customer profile (ICP), buyer personas (titles like
'CTO', 'VP of Sales'), dream-account companies, and surfaces specific people
at those accounts as potential prospects.

The scanner sometimes hallucinates or makes obvious mistakes:
  - Misidentifies the visitor's industry or product
  - Generates buyer titles that don't match how the company actually sells
  - Suggests dream accounts in the wrong industry
  - Surfaces 'top prospects' who aren't real B2B targets (universities,
    individual consultants, the visitor's own colleagues, etc.)

Your job: review the scanner's output for ONE visitor and decide whether
the cold email built from this output would land well or look broken.

What to evaluate:
  1. Does the scanner's company description match what the company actually
     does? (Use your training knowledge of well-known companies.)
  2. Are the buyer titles plausible for who would actually buy this
     company's product?
  3. Are the dream accounts in the right industry/sector for the visitor?
  4. Are the top prospects (specific named people at specific companies)
     reasonable B2B targets? Universities, schools, the visitor's own
     company, or solo-consulting 'companies' should be flagged.

What NOT to flag:
  - Path counts being high or low — that's a separate concern.
  - Buyer titles being slightly different from your own intuition (e.g.,
    scanner picks 'VP of E-commerce' when you'd pick 'Head of Digital' —
    both fine).
  - Smaller / less-recognizable dream accounts — being unfamiliar with a
    company isn't a problem.

Be conservative. 'review' is better than wrongly skipping a good lead.
'send' is the default unless something is clearly off. Only 'skip' when
the issues are obvious enough that a human looking at the email would
say 'no, this is wrong'.
"""


# ---------- the call ----------

def _scanner_to_prompt(scanner_output) -> str:
    """Format ScannerOutput as the user message body."""
    top_prospects_lines = []
    for p in scanner_output.top_prospects[:10]:
        top_prospects_lines.append(
            f"  - {p.get('name', '?')} - {p.get('title', '?')} "
            f"at {p.get('company', '?')} ({p.get('path_count', 0)} paths)"
        )
    top_companies_lines = []
    for company, paths in scanner_output.top_companies_by_paths[:10]:
        top_companies_lines.append(f"  - {company} ({paths} paths)")

    return (
        f"VISITOR'S COMPANY: {scanner_output.company_name}\n"
        f"\n"
        f"SCANNER'S COMPANY DESCRIPTION:\n"
        f"{scanner_output.company_description}\n"
        f"\n"
        f"SCANNER'S ICP DESCRIPTION:\n"
        f"{scanner_output.icp_description}\n"
        f"\n"
        f"SCANNER'S BUYER TITLES (top 5):\n"
        f"  {', '.join(scanner_output.buyer_titles[:5])}\n"
        f"\n"
        f"SCANNER'S TOP DREAM ACCOUNTS (up to 10 of {len(scanner_output.dream_accounts)}):\n"
        f"  {', '.join(scanner_output.dream_accounts[:10])}\n"
        f"\n"
        f"TOP COMPANIES BY PATH COUNT (where the scanner found warm intros):\n"
        + "\n".join(top_companies_lines) + "\n"
        f"\n"
        f"TOP INDIVIDUAL PROSPECTS (the people we'd surface in the email):\n"
        + "\n".join(top_prospects_lines) + "\n"
        f"\n"
        f"Return your QualityCheckResult: recommendation (send/skip/review), "
        f"confidence (0-100), issues (specific problems if any), "
        f"company_assessment (one sentence on what this company does), "
        f"and rationale (your reasoning)."
    )


def check_scanner_output(scanner_output) -> Optional[QualityCheckResult]:
    """Returns QualityCheckResult on success, or None on auth/network/parse
    failure. Caller should treat None as 'review' (don't send, but log)."""
    try:
        from anthropic import Anthropic
    except ImportError as e:
        print(f"[quality_check] anthropic SDK not installed: {e!r}", file=sys.stderr)
        return None

    from app_secrets import get_anthropic_api_key
    api_key = get_anthropic_api_key()
    if not api_key:
        print("[quality_check] ANTHROPIC_API_KEY not set "
              "(checked env + ~/.draftboard-secrets/ai.env)", file=sys.stderr)
        return None
    os.environ["ANTHROPIC_API_KEY"] = api_key

    user_content = _scanner_to_prompt(scanner_output)

    client = Anthropic()
    try:
        response = client.messages.parse(
            model=MODEL_ID,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
            output_format=QualityCheckResult,
        )
    except Exception as e:
        print(f"[quality_check] anthropic call failed: {e!r}", file=sys.stderr)
        return None

    return response.parsed_output
