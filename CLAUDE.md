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

### Brand colours
| Role | Hex |
|---|---|
| Primary | `#2940BE` |
| Positive | `#19C9A5` |
| Negative | `#E97132` |
| Neutral | `#1490EA` |
| Mixed | `#732BCC` |
