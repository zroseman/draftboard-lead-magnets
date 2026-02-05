# Lookalike Prospects

**Find decision-makers at companies similar to your target accounts.**

Lookalike Prospects helps sales teams identify and export prospects from competitor companies. Enter a company, discover its competitors via AI, select job titles, and get a list of real people with verified LinkedIn profiles—ready to export to Draftboard. Draftboard is a warm intro agent - add targets (like prospects) and the agent will map all your paths (mutual connections) to them, and score the strenth of each path (taking into account overlapping work/school history and other data points). 

**Live URL:** https://company-prospector.vercel.app

---

## Table of Contents

1. [User Flow](#user-flow)
2. [Features](#features)
3. [Architecture](#architecture)
4. [API Integrations](#api-integrations)
5. [Data Model](#data-model)
6. [Environment Variables](#environment-variables)
7. [Setup](#setup)
8. [Cost Considerations](#cost-considerations)

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LOOKALIKE PROSPECTS FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

1. COMPANY SEARCH
   ┌─────────────────────────────────────────┐
   │  User types company name                │
   │  ↓                                      │
   │  Clearout API autocomplete              │
   │  ↓                                      │
   │  User selects from dropdown             │
   │  (Shows logo, name, domain)             │
   └─────────────────────────────────────────┘
                    ↓
2. COMPETITOR DISCOVERY
   ┌─────────────────────────────────────────┐
   │  "Find Lookalike Companies" button      │
   │  ↓                                      │
   │  OpenAI (gpt-4o-mini) identifies        │
   │  top 5 competitors                      │
   │  ↓                                      │
   │  User sees competitors with reasons     │
   │  Can select/deselect which to include   │
   └─────────────────────────────────────────┘
                    ↓
3. TITLE SELECTION
   ┌─────────────────────────────────────────┐
   │  User enters job titles:                │
   │  - Type manually (comma-separated)      │
   │  - Select from saved Title Groups       │
   │                                         │
   │  Title Groups (localStorage):           │
   │  - "Heads of Marketing"                 │
   │    └─ VP Marketing, CMO, Director...    │
   │  - "Sales Leaders"                      │
   │    └─ VP Sales, CRO, Head of Sales...   │
   └─────────────────────────────────────────┘
                    ↓
4. PEOPLE SEARCH
   ┌─────────────────────────────────────────┐
   │  For each selected company:             │
   │  ↓                                      │
   │  Apollo People Search API               │
   │  (returns obfuscated names:             │
   │   "John S****", "Jane D***")            │
   │  ↓                                      │
   │  Uses 1 credit per company searched     │
   └─────────────────────────────────────────┘
                    ↓
5. NAME ENRICHMENT (Auto for first 5)
   ┌─────────────────────────────────────────┐
   │  For each person:                       │
   │  ↓                                      │
   │  Google CSE: "[first_name] [company]    │
   │              [title] linkedin"          │
   │  ↓                                      │
   │  Filter to linkedin.com/in/ URLs        │
   │  ↓                                      │
   │  OpenAI analyzes top 3 results:         │
   │  - Extracts full name from title        │
   │  - Validates match confidence           │
   │  - Returns LinkedIn URL                 │
   │  ↓                                      │
   │  Status: verified ✓ | failed ✗          │
   └─────────────────────────────────────────┘
                    ↓
6. RESULTS & EXPORT
   ┌─────────────────────────────────────────┐
   │  Results table shows:                   │
   │  - Name (with LinkedIn icon if URL)     │
   │  - Title                                │
   │  - Company                              │
   │  - Enrichment status indicator          │
   │  - Checkbox for selection               │
   │  - Individual "Enrich" button           │
   │                                         │
   │  Actions:                               │
   │  - "Enrich More" (next 5)               │
   │  - "Send to Draftboard" (selected)      │
   │                                         │
   │  Export options:                        │
   │  - API: Enter Draftboard API key        │
   │  - Manual: Copy LinkedIn URLs           │
   └─────────────────────────────────────────┘
                    ↓
7. SAVED SEARCHES
   ┌─────────────────────────────────────────┐
   │  All searches auto-saved to PostgreSQL  │
   │  ↓                                      │
   │  "Recent Searches" page (/recent)       │
   │  - View past searches                   │
   │  - Filter by company                    │
   │  ↓                                      │
   │  Search details page (/search/[id])     │
   │  - View saved prospects                 │
   │  - Manual enrichment (no auto-enrich)   │
   │  - Export to Draftboard                 │
   └─────────────────────────────────────────┘
```

---

## Features

### Core Features

| Feature | Description |
|---------|-------------|
| **Company Autocomplete** | Real-time company search with logos via Clearout API |
| **AI Competitor Discovery** | GPT-4o-mini identifies 5 relevant competitors |
| **Apollo People Search** | Find decision-makers by title at any company |
| **Google CSE Enrichment** | Resolve obfuscated names to real full names |
| **LinkedIn Verification** | Extract verified LinkedIn profile URLs |
| **Title Groups** | Save and reuse groups of job titles (localStorage) |
| **Saved Searches** | All searches persisted to PostgreSQL |
| **Draftboard Export** | Send prospects via API or copy URLs |

### Enrichment Status States

| Status | Icon | Meaning |
|--------|------|---------|
| `pending` | — | Not yet enriched |
| `enriching` | Spinner | Currently enriching |
| `verified` | ✓ Green | Full name & LinkedIn found |
| `failed` | ✗ Red | Enrichment attempted, no match |
| `unverified` | — | Skipped (can be manually enriched) |

### Credit System

| User Type | Daily Limit | Reset |
|-----------|-------------|-------|
| Anonymous (IP-based) | 3 searches | Midnight UTC |
| Logged in (Google OAuth) | 5 searches | Midnight UTC |

Each company searched consumes 1 credit. Searching 3 competitors = 3 credits.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        NEXT.JS 15 APP                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PAGES                           COMPONENTS                      │
│  ├── /                          ├── SavedTitlesPanel.tsx        │
│  │   └── Main search flow       ├── SendToDraftboardModal.tsx   │
│  ├── /recent                    └── RecentSearchesSection.tsx   │
│  │   └── Saved searches list                                    │
│  └── /search/[id]                                               │
│      └── Search details                                         │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  API ROUTES                                                      │
│  ├── /api/credits              GET  - Check remaining credits   │
│  ├── /api/find-competitors     POST - AI competitor discovery   │
│  ├── /api/find-people          POST - Apollo people search      │
│  ├── /api/enrich-people-google POST - Google CSE + OpenAI       │
│  ├── /api/save-search          POST - Save search to DB         │
│  ├── /api/recent-searches      GET  - List saved searches       │
│  ├── /api/search-details/[id]  GET  - Get search details        │
│  └── /api/auth/[...nextauth]   *    - Google OAuth              │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LIB                                                             │
│  ├── db.ts          - Neon PostgreSQL operations                │
│  └── auth.ts        - NextAuth configuration                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SERVICES                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Clearout   │  │   Apollo    │  │   OpenAI    │              │
│  │  (Company   │  │  (People    │  │  (GPT-4o-   │              │
│  │   Search)   │  │   Search)   │  │   mini)     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│        │                │                │                       │
│        │                │                │                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Google CSE  │  │    Neon     │  │ Draftboard  │              │
│  │ (LinkedIn   │  │ PostgreSQL  │  │    API      │              │
│  │  Search)    │  │             │  │  (Export)   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## API Integrations

### 1. Clearout Company Autocomplete
- **Endpoint:** `https://api.clearout.io/public/companies/autocomplete`
- **Purpose:** Company search with logos
- **Auth:** None (public API)
- **Cost:** Free

### 2. Apollo People Search
- **Endpoint:** `https://api.apollo.io/api/v1/mixed_people/api_search`
- **Purpose:** Find people by company domain + job titles
- **Auth:** `x-api-key` header
- **Returns:** People with obfuscated last names (e.g., "John S****")
- **Cost:** Per Apollo pricing

### 3. Google Custom Search Engine
- **Endpoint:** `https://www.googleapis.com/customsearch/v1`
- **Purpose:** Search for LinkedIn profiles
- **Query Pattern:** `[first_name] [company] [title] linkedin`
- **Auth:** API key + CX (search engine ID)
- **Cost:** 100 free/day, then $5/1000 queries

### 4. OpenAI GPT-4o-mini
- **Purpose 1:** Competitor discovery
- **Purpose 2:** Analyze Google results, extract full name
- **Auth:** API key
- **Cost:** ~$0.15/1M input tokens (very cheap)

### 5. Draftboard Import API
- **Endpoint:** `https://intros.draftboard.com/api/v1/integration/targets/import`
- **Purpose:** Import prospects with LinkedIn URLs
- **Auth:** Bearer token (user's API key)
- **Payload:** `{ linkedinUrls: string[], tags: string[] }`

---

## Data Model

### Database Schema (Neon PostgreSQL)

```sql
-- Users (Google OAuth)
users
├── id            SERIAL PRIMARY KEY
├── email         VARCHAR(255) UNIQUE NOT NULL
├── name          VARCHAR(255)
├── image         TEXT
└── created_at    TIMESTAMP

-- Daily credit tracking
daily_credits
├── id            SERIAL PRIMARY KEY
├── user_id       INTEGER (nullable, FK → users)
├── ip_address    VARCHAR(45)
├── date          DATE NOT NULL
├── credits_used  INTEGER DEFAULT 0
└── created_at    TIMESTAMP
-- Unique on (user_id, date) for logged-in users
-- Unique on (ip_address, date) for anonymous users

-- Saved searches
prospect_searches
├── id               SERIAL PRIMARY KEY
├── source_company   VARCHAR(255) NOT NULL
├── source_domain    VARCHAR(255)
├── competitors      JSONB DEFAULT '[]'
├── titles_used      JSONB DEFAULT '[]'
├── prospects_count  INTEGER DEFAULT 0
└── search_timestamp TIMESTAMP WITH TIME ZONE

-- Saved prospects
saved_prospects
├── id                SERIAL PRIMARY KEY
├── search_id         INTEGER (FK → prospect_searches)
├── name              VARCHAR(255) NOT NULL
├── title             VARCHAR(500)
├── company           VARCHAR(255)
├── linkedin_url      TEXT
└── enrichment_status VARCHAR(50) DEFAULT 'pending'
```

### TypeScript Types

```typescript
interface Prospect {
  id: string;
  name: string;
  title: string;
  company: string;
  linkedinUrl: string;
  email?: string;
  enrichmentStatus: 'pending' | 'enriching' | 'verified' | 'unverified' | 'failed';
  first_name?: string;           // Original from Apollo
  last_name_obfuscated?: string; // Original from Apollo
}

interface TitleGroup {
  id: string;
  name: string;
  titles: string[];
}

interface Competitor {
  name: string;
  domain: string;
  reason: string;
  selected: boolean;
}
```

### localStorage Keys

| Key | Data |
|-----|------|
| `lookalike-prospects-title-groups` | `TitleGroup[]` - Saved title groups |
| `draftboard_api_key` | `string` - User's Draftboard API key |

---

## Environment Variables

```bash
# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Auth (NextAuth.js)
NEXTAUTH_SECRET=random-secret-string
NEXTAUTH_URL=http://localhost:3000  # or production URL

# Google OAuth (for user login)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx

# Apollo.io (people search)
APOLLO_API_KEY=xxx

# Google Custom Search (LinkedIn enrichment)
GOOGLE_CSE_API_KEY=AIzaSy...
GOOGLE_CSE_CX=abc123...

# OpenAI (competitor discovery + name extraction)
OPENAI_API_KEY=sk-...
```

---

## Setup

### 1. Clone and Install

```bash
cd apps/company-prospector
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in all values (see Environment Variables section)
```

### 3. Initialize Database

```bash
psql $DATABASE_URL < schema.sql
```

### 4. Run Development Server

```bash
npm run dev
# Open http://localhost:3000
```

### 5. Deploy to Vercel

```bash
npx vercel --prod
# Configure environment variables in Vercel dashboard
```

---

## Cost Considerations

| Service | Free Tier | Paid |
|---------|-----------|------|
| Clearout | Unlimited | — |
| Apollo | Per plan | Per plan |
| Google CSE | 100 queries/day | $5/1000 queries |
| OpenAI GPT-4o-mini | — | ~$0.15/1M tokens |
| Neon PostgreSQL | 500MB free | Per usage |
| Vercel | Hobby free | Per usage |

### Per-Search Cost Estimate

Searching 1 company with 5 prospects enriched:
- Apollo: 1 API call
- Google CSE: 5 queries (~$0.025 at paid rate)
- OpenAI: ~500 tokens for competitors + ~2000 tokens for 5 enrichments (~$0.0004)

**Approximate cost per full search: ~$0.03** (excluding Apollo)

---

## File Structure

```
apps/company-prospector/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Main search flow
│   │   ├── recent/page.tsx             # Saved searches list
│   │   ├── search/[id]/page.tsx        # Search details
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── credits/route.ts
│   │   │   ├── find-competitors/route.ts
│   │   │   ├── find-people/route.ts
│   │   │   ├── enrich-people-google/route.ts
│   │   │   ├── save-search/route.ts
│   │   │   ├── recent-searches/route.ts
│   │   │   └── search-details/[id]/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── SavedTitlesPanel.tsx        # Title groups UI
│   │   ├── SendToDraftboardModal.tsx   # Export modal
│   │   └── RecentSearchesSection.tsx   # Recent searches widget
│   ├── lib/
│   │   ├── db.ts                       # Database operations
│   │   └── auth.ts                     # NextAuth config
│   └── types/
│       └── index.ts                    # TypeScript interfaces
├── schema.sql                          # Database schema
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```
