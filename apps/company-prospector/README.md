# Lookalike Generator

**Find decision makers at a company and all its competitors.**

Enter a company name, discover similar companies via AI, select job titles, and get a list of real people with verified LinkedIn profiles—ready to export to [Draftboard](https://draftboard.com).

![Lookalike Generator Screenshot](https://via.placeholder.com/800x450?text=Add+Screenshot+Here)

## Features

- **Company Autocomplete** — Search any company with logo previews
- **AI Competitor Discovery** — GPT-4o-mini identifies 5 similar companies
- **People Search** — Find decision makers by job title via Apollo
- **Name Enrichment** — Resolve obfuscated names using Google + AI
- **LinkedIn Verification** — Get verified LinkedIn profile URLs
- **Title Groups** — Save and reuse groups of job titles
- **Saved Searches** — All searches persisted to PostgreSQL
- **Draftboard Export** — Send prospects via API or copy URLs

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/zroseman/draftboard-lead-magnets.git
cd draftboard-lead-magnets/apps/company-prospector
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Then fill in your API keys (see [API Keys Required](#api-keys-required) below).

### 3. Set up the database

Create a free PostgreSQL database at [Neon](https://neon.tech), then run:

```bash
psql $DATABASE_URL < schema.sql
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## API Keys Required

| Variable | Description | Get it from |
|----------|-------------|-------------|
| `DATABASE_URL` | PostgreSQL connection string | [Neon](https://neon.tech) (free tier) |
| `NEXTAUTH_SECRET` | Random string for session encryption | Run: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your app URL | `http://localhost:3000` for dev |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Same as above |
| `APOLLO_API_KEY` | Apollo.io API key | [Apollo.io](https://www.apollo.io/) |
| `OPENAI_API_KEY` | OpenAI API key | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `GOOGLE_CSE_API_KEY` | Google Custom Search API key | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CSE_CX` | Custom Search Engine ID | [Programmable Search Engine](https://programmablesearchengine.google.com/) |

## How It Works

```
1. Enter company name → Clearout autocomplete
2. Select company → AI finds 5 competitors
3. Choose titles → Apollo finds people (names obfuscated)
4. Enrichment → Google CSE + GPT resolves real names
5. Export → Send to Draftboard or copy LinkedIn URLs
```

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Database:** Neon PostgreSQL
- **Auth:** NextAuth.js with Google OAuth
- **Styling:** Tailwind CSS
- **AI:** OpenAI GPT-4o-mini
- **APIs:** Apollo.io, Google Custom Search, Clearout

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzroseman%2Fdraftboard-lead-magnets&env=DATABASE_URL,NEXTAUTH_SECRET,NEXTAUTH_URL,GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,APOLLO_API_KEY,OPENAI_API_KEY,GOOGLE_CSE_API_KEY,GOOGLE_CSE_CX&root-directory=apps/company-prospector)

## Documentation

See [PRODUCT.md](./PRODUCT.md) for detailed documentation including:
- Complete user flow diagrams
- API integration details
- Database schema
- Cost considerations

## License

MIT
