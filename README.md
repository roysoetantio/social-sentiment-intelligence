# Social Sentiment Intelligence Dashboard

A production-grade brand sentiment monitoring dashboard built for **UEM Edgenta Berhad** — tracking brand mentions, sentiment trends, and media coverage across social media, news portals, and RSS feeds.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 |
| Routing | React Router v6 |
| Charts | Recharts |
| Styling | Tailwind CSS v3 |
| Database | Supabase (PostgreSQL) |
| NLP | `sentiment` (AFINN lexicon) |
| Icons | Lucide React |
| Dates | date-fns |

---

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Fill in your API keys in .env

# Start development server
npm run dev       # http://localhost:5173

# Build for production
npm run build

# Preview production build
npm run preview

# Run data ingest (pulls live mentions → Supabase)
npm run ingest
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your keys:

| Variable | Used by | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend + Ingest | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase anon key (read-only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Ingest | Supabase service role key (writes) |
| `VITE_RAPIDAPI_KEY` | Ingest | RapidAPI key (Twitter135, Real-Time News) |
| `VITE_TWITTER135_API_KEY` | Ingest | Twitter135 key (falls back to VITE_RAPIDAPI_KEY) |
| `VITE_GOOGLE_CSE_KEY` | Ingest | Google Custom Search API key |
| `VITE_GOOGLE_CSE_CX` | Ingest | Google Custom Search engine ID |
| `SERPER_API_KEY` | Ingest | Serper.dev API key |
| `WORLDNEWS_API_KEY` | Ingest | World News API key |

---

## Pages

| Page | Route | Description |
|---|---|---|
| Overview | `/` | Executive KPIs, sentiment timeline (click-through to Mentions), platform breakdown |
| Mentions Explorer | `/mentions` | Filterable mention feed with detail panel |
| Sentiment Analytics | `/analytics` | Deep charts: heatmap, share of voice, keyword comparison |
| Keyword Manager | `/keywords` | Manage keyword groups and tracked terms |

---

## Data Ingest Sources

The `scripts/ingest.js` script pulls from multiple sources and upserts into Supabase. Re-running is safe (deduplication on `url`).

| Source key | Description |
|---|---|
| `twitter135` | RapidAPI Twitter135 — Latest + Top search types |
| `realtimesnews` | RapidAPI Real-Time News Data |
| `serper_news` | Serper Google News (EN + MS, 2 pages each) |
| `serper_social` | Serper web search scoped to Twitter/LinkedIn/YouTube |
| `rss_my` | Hardcoded Malaysian news RSS feeds |
| `worldnews` | World News API — global English news |

Each ingest run prints a full report of every post fetched, with a `⚠️ NO PROPER DATE` flag for any article missing a valid publish date.

---

## Project Structure

```
src/
├── context/        # DashboardContext — global filter + data state
├── services/       # apiService (Supabase), filterService, sentimentService
├── data/           # Mock data fallback + analytics helpers
├── components/
│   ├── layout/     # Sidebar, TopBar, Layout wrapper
│   ├── charts/     # SentimentTimeline, PlatformBreakdown, Heatmap, etc.
│   ├── filters/    # FilterBar, KeywordFilterPanel
│   └── common/     # KPICard, MentionCard, badges
├── pages/          # Overview, MentionsExplorer, SentimentAnalytics, KeywordManager
└── constants/      # Brand colours, sentiment thresholds
scripts/
├── ingest.js       # Main ingest script (all sources)
└── test-worldnews.js  # Standalone World News API test
supabase-schema.sql          # Mentions table schema
supabase-keywords-schema.sql # Keyword groups + keywords schema
```

---

## Brand Colours

| Role | Hex |
|---|---|
| Primary | `#2940BE` |
| Positive | `#19C9A5` |
| Negative | `#E97132` |
| Neutral | `#1490EA` |
| Mixed | `#732BCC` |

---

## Key Design Decisions

- **Sentiment scoring** — AFINN lexicon, score normalised to `[-1, 1]`, thresholded at `±0.05` for label assignment
- **Deduplication** — Supabase upsert on `url` unique constraint; safe to re-run ingest anytime
- **Keyword validation** — ingest drops results where keyword terms don't appear in `text + full_text + url`
- **Own content filtering** — a `BLACKLIST` of UEM Edgenta's own domains/accounts is excluded from all Serper searches
- **Fallback data** — if Supabase is empty or unreachable, the app renders mock data from `src/data/`
- **Click-through** — clicking any point on the sentiment timeline navigates to Mentions Explorer filtered to that exact time period
