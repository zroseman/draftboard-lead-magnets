# rb2b-magnet

Personalized warm-intro lead magnet for RB2B-identified website visitors.

For each tier-1/2 visitor we identify on draftboard.com via RB2B, we run their
company through Draftboard's existing scanner pipeline (the same one that
powers `draftboard.com/scanner`) server-side, then send a personalized cold
email with the warm-intro stats we found. The email is link-free by design;
when the recipient replies, we (manually for now) follow up with the
personalized scanner URL.

This is "warm cold" outreach. The recipient already showed intent by visiting
the site, so we lead with a real artifact we built for them, not a generic
pitch.

## Why this lives in `experiments/draftboard-lead-magnets/`

This is conceptually a lead-magnet project (custom asset per prospect), not
a daily outbound pipeline. Sibling project: `apps/company-prospector/`
(lookalike company finder). Both produce per-prospect deliverables; both
deserve their own home, separate from `draftboard-outreach/` which handles
high-volume templated touches.

## How it relates to other projects

- **signal-router/** (`~/Desktop/Projects/signal-router/`) — owns the RB2B
  poller and writes visitor records to SQLite at
  `~/.draftboard-state/signal-router.db`. We READ from this DB. We do not
  write to it. Read-only dependency.
- **draftboard-site-v2/** — owns the `/scanner` and `/scanner/[leadHash]`
  routes that the visitor lands on. We hit its `/api/scanner/submit` proxy
  and the `/api/v2/lead-magnet/*` backend behind it. We do not modify it.
  The `?direct=1` query param (PR #22) skips the ICP-confirm gate and
  picker step on the deep-link URL we email out.
- **knowledge-base/** (`kb` pip package) — Draftboard product context for
  voice/messaging if needed. Optional dependency.

## Pipeline

1. **Pull candidates** from signal-router DB: tier-1/2 RB2B visitors from
   the last N hours with a valid email (Apollo or RB2B-supplied), excluding
   anyone already in `data/sends.jsonl`.
2. **Submit scanner run** for each: `POST https://www.draftboard.com/api/scanner/submit`
   with `{name, companyWebsite}`. Returns `leadHash` + `conversationId`.
   No reCAPTCHA needed for low-volume server-to-server.
3. **Poll** `https://intros.draftboard.com/api/v2/lead-magnet/summary` until
   `run.state === 5` (Completed). ~60-90s per visitor typical.
4. **Fetch** `/api/v2/lead-magnet/results` to get the `targets` array with
   per-target `pathCount`.
5. **Compose** the personalized email (see voice rules below).
6. **Deliver**: create a Gmail draft (v1) for human review, or auto-send
   (v2) once we trust the rendering.
7. **Log** to `data/sends.jsonl` so we don't double-send.
8. **Reply handling** (manual for v1): when the recipient replies, send the
   `https://www.draftboard.com/scanner/{leadHash}?direct=1` URL.

## Voice rules

Inherited from Zach's global CLAUDE.md, applied to email (NOT LinkedIn):

- **Normal capitalization** (e.g. "We ran Walnut through our network").
- **Hyphen-after-name greeting**, no comma: `Stefania -`
- **No em-dashes**, use hyphens for the dash effect.
- **Single quotes only**, never double or curly.
- **Short, warm, direct.** One builder to another.
- **Avoid AI vocabulary**: delve, crucial, robust, comprehensive, leverage,
  synergy, circle back.
- **Avoid salesy phrases**: "would it help", "quick question", "circle back".
- **Sign-off**: `Thanks,\nZach\nFounder of Draftboard` (NOT em-dash, NOT
  "All the best" — kept simple per cold-email-agent feedback).
- **CAN-SPAM line**: `(not interested? just reply 'no thanks' and i'll
  take you off the list.)` — kept casual + lowercase to read human.

## Locked email template

```
Subject: {first_name}, found {path_count} warm paths into your ICP

{first_name} -

We ran {company} through our network and mapped {path_count} warm intro paths
to {buyer_titles_phrase} at companies like {top_3_companies}.

Your own network probably has more. Reply here and I'll send you the
personalized scan we already pulled for you.

Thanks,
Zach
Founder of Draftboard

(not interested? just reply 'no thanks' and i'll take you off the list.)
```

Variables:
- `{first_name}` — from RB2B visitor name
- `{company}` — visitor's company (RB2B or scanner-resolved)
- `{path_count}` — sum of pathCounts from `/results`
- `{buyer_titles_phrase}` — top buyer title pluralized naturally
  ("CTOs", "Heads of Marketing", "VPs of Solutions Engineering")
- `{top_3_companies}` — top 3 dream accounts by pathCount, junk-filtered

## Open design questions (for next session)

1. **Path-count framing.** Pipeline is variable: same lead, two runs, 5 min
   apart, returned 39 paths and 938 paths. The 938 is dominated by one
   company (780 of them at ZoomInfo). Options: cap at a realistic ceiling,
   advertise prospect count instead of path count, or accept variance and
   trust the URL the visitor clicks to show consistent data.
2. **Send mechanism.** Gmail drafts (manual review) → Gmail auto-send →
   Smartlead campaign. Start at drafts-only, graduate based on output
   quality.
3. **Reply handler.** v1 = Zach replies manually with the URL. v2 = monitor
   inbox for replies, auto-respond with the URL.
4. **Daily volume cap.** Probably 8-15/day to start. Budget = scanner
   pipeline cost (Apollo + Exa + LLM) + email-deliverability volume
   warming.

## Run

(All TBD — pipeline.py is the only module built so far.)

Smoke test (already verified end-to-end against production):
```
python3 scripts/test_pipeline.py "Haley Hensel" "https://walnut.io"
```

## Status

- [x] Server-side scanner pipeline working end-to-end (submit → poll → results)
- [x] Email body + subject composer with junk-company filter
- [x] Smoke-tested against real visitor (Walnut, Microblink)
- [ ] Candidate selection from signal-router DB
- [ ] Dedup + send log
- [ ] Gmail draft creation
- [ ] Daily orchestration entry point
- [ ] Reply handling
- [ ] launchd schedule
