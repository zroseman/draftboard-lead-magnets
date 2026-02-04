# Company Prospector

Find decision makers at any company by job title. Powered by Apollo.io and Draftboard.

## Setup

1. Copy `.env.example` to `.env` and fill in the values:
   - `DATABASE_URL` - Neon PostgreSQL connection string
   - `NEXTAUTH_SECRET` - Random secret for NextAuth
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth credentials
   - `APOLLO_API_KEY` - Apollo.io API key

2. Run the database schema:
   ```bash
   psql $DATABASE_URL < schema.sql
   ```

3. Install and run:
   ```bash
   npm install
   npm run dev
   ```

## Flow

1. User enters company name
2. Select from matching companies
3. Enter target job titles (comma-separated)
4. View results, select prospects
5. Send to Draftboard via API or manual copy
