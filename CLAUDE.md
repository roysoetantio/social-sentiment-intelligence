# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server at http://localhost:5173
npm run build      # Production build
npm run preview    # Preview production build
npm run ingest     # Pull live mentions from all sources → Supabase (needs .env)
```

There are no tests or linting configured.

## Architecture

This is a **React 18 + Vite + Tailwind** dashboard with two distinct data layers:

### Data flow
1. **On app load** — `DashboardContext` calls `fetchAllMentions()` (apiService), which reads from Supabase. If Supabase is empty or unreachable, the app falls back to mock data in `src/data/`.
2. **Ingest script** (`scripts/ingest.js`) — a standalone Node.js script that fetches from external APIs and upserts into Supabase. Run manually or on a cron. Uses `SUPABASE_SERVICE_ROLE_KEY` (not the anon key) for writes.
3. **Filtering** — all filter state lives in `DashboardContext`. `filterService.js` applies all active filters to `allMentionsData`. Source counts in the sidebar are computed *without* the source filter applied (`mentionsWithoutSourceFilter`) so clicking a source filter always shows a nonzero count.

### Ingest sources (scripts/ingest.js)
Each source has a `fetch*()` function that returns rows matching the Supabase schema. Rows are upserted on `url` (unique constraint), so re-running is safe. Sources currently integrated:

| Source key | Function | Notes |
|---|---|---|
| `twitter135` | `fetchTwitter135` | RapidAPI Twitter135 — Latest + Top search types |
| `realtimesnews` | `fetchRealTimeNews` | RapidAPI Real-Time News Data |
| `serper_news` | `fetchSerperNews` | Serper Google News, en + ms, 2 pages each |
| `serper_social` | `fetchSerperSocial` | Serper web search scoped to Twitter/LinkedIn/YouTube |
| `google_cse` | `fetchGoogleCSE` | Google Custom Search |
| `rss_my` | `fetchRSS` | Hardcoded Malaysian news RSS feeds |
| `worldnews` | `fetchWorldNews` | World News API — global news search |
| `claude_search` | Claude WebSearch tool (agent step) | Claude searches the web for each keyword and saves results directly to Supabase — run as part of Step 1 in post-ingest workflow |

**Rule:** When adding a new ingest source, always update both:
- `src/components/filters/FilterBar.jsx` → `SOURCE_LABELS` (icon + label for filter sidebar)
- `src/pages/MentionsExplorer.jsx` → mention card source label map

### Environment variables
| Variable | Used by |
|---|---|
| `VITE_SUPABASE_URL` | Frontend + ingest |
| `VITE_SUPABASE_ANON_KEY` | Frontend reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Ingest writes |
| `VITE_RAPIDAPI_KEY` | Ingest (Twitter135, Real-Time News) |
| `VITE_TWITTER135_API_KEY` | Ingest (Twitter135 — falls back to VITE_RAPIDAPI_KEY) |
| `VITE_GOOGLE_CSE_KEY` + `VITE_GOOGLE_CSE_CX` | Ingest (Google CSE) |
| `SERPER_API_KEY` | Ingest (Serper) |
| `WORLDNEWS_API_KEY` | Ingest (World News API) |

### Key design decisions
- **Sentiment scoring** uses the `sentiment` npm package (AFINN lexicon). Score is normalized to [-1, 1] and thresholded at ±0.05 for label. Confidence is hardcoded at 0.75 for all ingest sources.
- **Deduplication** happens at the Supabase upsert level (`onConflict: 'url'`). Twitter135 also deduplicates within each batch before saving.
- **Keyword validation** — after fetching, ingest drops any result where the keyword terms don't appear in `text + full_text + url`. This prevents false positives from API relevance ranking.
- **BLACKLIST** in ingest — a constant list of UEM Edgenta's own domains/accounts excluded from Serper searches so owned content doesn't pollute external mention counts.
- **Keywords** are loaded dynamically from Supabase (`keyword_groups` + `keywords` tables). If the DB is empty, a hardcoded fallback list is used (UEM Edgenta, Edgenta NXT, Shaiful Subhan, Chua Yong Howe).

## Post-ingest workflow

**Every time after running ingest, follow ALL six steps in order — never stop at step 1.**

**Step 1 — Run ingest**
```bash
npm run ingest
node scripts/ingest-google-alerts.js   # if running Google Alerts too
```
Then Claude searches the web for each active keyword using the **WebSearch tool** and saves results directly to Supabase as `claude_search` source.

**Claude Search rules (MUST follow):**
- Always use the **WebSearch tool** — never plain HTTP fetch, Serper, or any other API
- For each keyword (and all its aliases), run WebSearch queries to discover mentions
- For enriching `full_text` on existing articles, search by article title using WebSearch — extract body content from search result snippets
- WebSearch returns richer content than plain HTTP crawl and can handle JS-rendered/paywalled sites
- After getting `full_text` from WebSearch, immediately write a `summary` (≤400 chars, 2-3 sentences) of the article and save it to the `summary` column in Supabase alongside `full_text`
- The `summary` is displayed in the mention detail panel in the dashboard — make it concise and informative
- After saving `claude_search` rows, run the multi-keyword backfill so articles mentioning multiple keywords get tagged correctly

**Step 2 — Fix dates (dry run first, then apply)**
`fix-dates.js` targets rows where `date_fixed != true`. When ingest can't get a real date from the source API, it falls back to `new Date()` (the ingest timestamp) — those are the rows that need crawling. The script extracts real article dates from meta tags, JSON-LD, `<time>` elements, and URL paths. Twitter/X URLs are skipped (API date is reliable).
```bash
node scripts/fix-dates.js              # dry run — review output first
node scripts/fix-dates.js --apply      # write corrected dates to Supabase
```

**Step 3 — Send unfixed URLs to user**
After `--apply`, collect all URLs that still couldn't be dated (403s, JS-rendered, paywalled). Present the full list to the user — they provide correct dates, then apply them manually via Supabase UPDATE.

**Step 4 — Generate AI summaries**
Spawn an agent to generate summaries for mentions that don't have one yet. The agent should:
- Fetch all mentions where `summary is null` AND `full_text >= 150 chars` AND source is NOT `twitter135`
- For each, write a 2-3 sentence factual summary (max 400 chars) based on `text` (title) + `full_text`
- PATCH the `summary` field back to Supabase for each row
- Report: how many fetched, skipped, saved

**Step 5 — Delete junk mentions**
Open Mentions Explorer in the dashboard. Delete rows that are off-topic despite passing keyword validation, duplicate stories with different URLs, or have garbled/truncated text.

**Step 6 — Reload the dashboard**
Refresh the browser — the app reads fresh from Supabase on load.

### Brand colours
| Role | Hex |
|---|---|
| Primary | `#2940BE` |
| Positive | `#19C9A5` |
| Negative | `#E97132` |
| Neutral | `#1490EA` |
| Mixed | `#732BCC` |
