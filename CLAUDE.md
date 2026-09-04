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
1. **On app load** — `DashboardContext` calls `fetchAllMentions()` (apiService), which reads from Supabase. If Supabase is empty or unreachable, the app falls back to data in `src/data/fallbackMentions.js` and `src/data/fallbackKeywords.js`.
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
| `instagram_comments` | `scripts/ingest-instagram-mentions.js` | Comments on our own IG posts. Needs the Meta app in **Live** mode |
| `instagram_tags` | `scripts/ingest-instagram-mentions.js` | Posts by other accounts that @-tagged us. Blocked handles come from `blacklist` |
| `claude_search` | Claude WebSearch tool (agent step) | Claude searches the web for each keyword and saves results directly to Supabase — run as part of Step 1 in post-ingest workflow |

**Rule:** When adding a new ingest source, always update both:
- `src/components/filters/FilterBar.jsx` → `SOURCE_GROUPS` (icon + label for filter sidebar)
- `src/pages/MentionsExplorer.jsx` → mention card source label map

## Overview: comparison, sources and coverage quality

Three things on the Overview depend on conventions that are easy to break:

**Period-over-period.** The **All** range has no window before it — it starts at
the oldest row there is — so `hasComparisonPeriod` is false there and the pages
drop every delta and the leaderboard's Trend column rather than printing "new"
on all 216 sources. The Sources page swaps its New Sources tile for Busiest
Source on that range, for the same reason.

`DashboardContext` exposes `previousPeriodMentions` —
the window of equal length immediately before the selected one, built from the
same `scopedMentions` and the same `searchQuery` as `globalFilteredMentions`, so
the two sets are comparable and both are tenant-scoped. Volume deltas are
percent; rate deltas (positive/negative/net) are **percentage points**, because
a percent change of a percent means nothing. A previous period of zero renders
as `new`, never as +100%.

`deltaGoodWhen` on `KPICard` decides the colour, not the direction: Total
Mentions is deliberately `"none"` (neutral grey) because a volume spike can be
a campaign or a crisis, and green-on-up would assert the wrong one.

**Sources & Coverage** is a page (`/sources`, in the sidebar) plus a compact
card on the Overview that links to it. The page carries the sortable, searchable
`SourceTable`, the coverage panel, and a **How to read this** legend; the card
carries `TopSourcesChart` beside the same coverage panel. Both read the same
`getSourceLeaderboard` rows, so they can differ in density but never in fact.

Every badge — tier, at-risk, new, trend — lives in `components/common/SourceMarks.jsx`
and carries its own hover explanation. Tiers are explained inside **Coverage
Quality**, where each tier expands to its definition and the outlets in it (Tier
1 open by default); `SourceLegend` covers only the leaderboard's marks, because
repeating the tiers there made it long enough to skip. Either way the panel says
out loud that tiers are an editorial list rather than a measured ranking — a
reader must never have to guess what "T3" claims. Radix tooltips need a
provider: one is mounted around `Layout` in `App.jsx`.

**"At-risk" and "high risk" are different filters, and mixing them loses rows.**
`isAtRisk()` in `constants/sentiment.js` is what the Overview KPI, the sidebar
count and the leaderboard's At-risk column all mean: `medium` OR `high`, not
positive, and not already overridden away from negative by an analyst. The
Explorer's **"Show high risk only"** checkbox (`riskOnly` in `filterService`) is
literally `riskLevel === 'high'`. The Edge Malaysia's at-risk coverage is entirely
`medium`, so drilling in through `riskOnly` would land on an empty list under a
count that said 2.

So the at-risk count is its own drill-down: `atRiskOnly` in `DashboardContext`,
filtered with the very same `isAtRisk()` the count uses, surfaced as a removable
chip like `heatmapFilter` and `outletFilter`. Clicking the **row** still goes to
everything that outlet published; clicking the **count** goes to the rows it is
counting. Do not "simplify" this by pointing it at `riskOnly` or at a negative
sentiment filter — negative happens to match today's Edge Malaysia rows and would
silently drop a neutral-labelled high-risk story.

**Top Sources.** `getOutletRef()` in `src/utils/outlets.js` is the single
definition of "which source is this". The leaderboard groups by its `key`, and
`filterService` filters by the same key, so the count in the list and the number
of rows the drill-down lands on cannot disagree. Published coverage is
attributed to the **publication** (domain), social posts to the **account** —
hence two tabs, not one mixed ranking. Rows whose author the source API never
supplied are bucketed as `Unattributed · {platform}` and sorted below every real
source; before that, a placeholder called "LinkedIn" outranked every actual
person posting about us.

Domain matching is **suffix-based** (`es.linkedin.com`, `klse.i3investor.com`).
An exact-match set files country subdomains as if they were outlets.

**Outlet tiers are editorial.** `TIER_1_DOMAINS` / `TIER_2_DOMAINS` in
`utils/outlets.js` decide what "Tier 1 coverage" means on the front page —
changing them changes a number executives read. Add domains deliberately.

Tiering exists because **reach is not a defensible headline**: it is reported on
a minority of rows (Twitter and Instagram only), so a summed "total reach" is a
partial number presented as a total. Anywhere reach appears it is stated with
its coverage (`getReachCoverage`), and the KPI subtitle counts outlets instead.

## Social Feed (owned accounts)

`social_posts` holds **our own published posts** — Instagram (`@uemedgenta`)
and Facebook (`UEMEdgentaBerhad`). It is deliberately NOT part of the mentions
pipeline: owned
content in `mentions` would inflate the headline counts, which is the same
reason the ingest `BLACKLIST` exists. The "new source → update FilterBar +
MentionsExplorer" rule does **not** apply here.

```bash
node scripts/ingest-instagram-owned.js            # last 12 months
node scripts/ingest-instagram-owned.js --all      # full history
node scripts/ingest-instagram-owned.js --dry      # preview, writes nothing

node scripts/ingest-facebook-owned.js  --all      # same flags, Facebook page
node scripts/fb-setup.js                          # re-mint FB_PAGE_TOKEN
```

- Pages: `src/pages/SocialFeed.jsx` is the whole feed for **every** platform —
  it takes a `platform` prop and reads its differences from `PLATFORMS` inside
  that file. `src/pages/SocialFeedFacebook.jsx` is a three-line binding, not a
  second copy; adding LinkedIn means one `PLATFORMS` entry plus a wrapper.
  Reach-derived UI (the reach tile, engagement rate, the two reach sorts) is
  gated on `hasReach`, computed from the loaded rows rather than a flag — so it
  appears by itself the day Facebook's `read_insights` lands.
  `/social` redirects to the Instagram page. In the sidebar these sit under a
  collapsible **Social Feed** group (`children` on the nav item in
  `Sidebar.jsx`); add a platform by adding a child there plus a route.
- Gated to the **CCD** tenant via `departments: ['CCD']` on the nav group (and a
  matching check in `More.jsx` for mobile). Like `/keywords` and `/admin`, this
  is nav-level gating only — the routes stay reachable by URL, and RLS lets any
  active user read the table.
- Search and the date window come from the **TopBar**, not from in-page
  controls: `SocialFilterContext` mirrors the slice of `DashboardContext` the
  TopBar reads, and the TopBar swaps stores when the route starts with
  `/social`. The page registers its loaded posts back into the context so the
  date picker can mark days that have posts.
- The TopBar's **All** preset resolves to the oldest loaded post rather than a
  fixed span (the mentions side has the same preset, resolved against the oldest
  mention in tenant scope). Its ceiling is whatever ingest pulled —
  the default run is 12 months, so `--all` is required for real full history.
  `fetchSocialPosts` pages the table in blocks of 1000 so a long history isn't
  silently truncated by PostgREST's response cap.
- The grid renders 24 posts at a time and extends on scroll (IntersectionObserver
  on a sentinel, plus a Load more button for keyboard users and backgrounded
  tabs, where no intersection is ever reported).
- Insights are fetched **inline** on the media edge
  (`insights.metric(reach,saved,shares,total_interactions,views)`), which keeps a
  12-month pull at ~8 requests instead of ~300. `impressions` is retired.
- The script refreshes `IG_ACCESS_TOKEN` on every run and writes the new token
  and expiry back to `.env`, so the 60-day token never lapses while ingest runs.
- Instagram CDN URLs are signed and expire; the cards fall back to a placeholder
  and re-running ingest refreshes them.
- Comment text IS available, so the page carries no "comments are unavailable"
  caveat. Comment bodies land in `mentions` as `instagram_comments`, not on this
  page — this page is post performance only.
- **Comment text IS available — the app must stay in Live mode.** While the Meta
  app was in Development mode, `/{media-id}/comments` answered `200` with
  `data: []` *and paging cursors* (cursors on an empty array mean "filtered",
  not "none"). Publishing the app to Live mode fixed it with no App Review:
  comments and the `/me/tags` edge both returned full data immediately. If
  comments ever go empty again, check the app has not been reverted to
  Development mode before assuming a permissions problem.
- Comment author is `from{id,username}`. A bare `username` field is accepted by
  the API and silently returns nothing — it is not an error, just absent.

### Facebook Pages API

Verified working 2026-09-03 against `UEMEdgentaBerhad` (Page id
`1647201428701188`, FB app `2170440680186289`).

- **Facebook does NOT have Instagram's dev-mode comment blackout.** A Page owns
  the comments on its own posts, so `/{post}/comments` returns real bodies with
  `pages_read_user_content` under Standard Access — no App Review. Do not
  assume the Instagram limitation applies here; it does not.
- Scopes: `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`.
  `FB_PAGE_TOKEN` is derived from a long-lived user token and **never expires**,
  so there is no refresh script — unlike `IG_ACCESS_TOKEN`.
- **`read_insights` is NOT granted**, so reach / impressions / views come back
  as an EMPTY data array with no error — the same "silence means denied" tell as
  Instagram's comments. Grant it, then set `FB_INSIGHTS=1` to turn the inline
  insights request on.
- Comment **authors are `null`** even with the scopes above. Text yes, identity
  no.
- `/{page}/tagged` — the Mentions tab, where third parties tag us — is blocked
  behind Page Public Content Access, i.e. the same verified Business Portfolio
  that gates Instagram. **This is now the single unlock for all Meta data.**
- `likes` in `social_posts` stores the **total reaction count**, not the bare
  like count, because that is the figure Facebook prints under the post. The
  breakdown survives in `raw`.

### Instagram keyword attribution

`ingest-instagram-mentions.js` hardcodes no keyword, brand name or owned handle
— everything comes from `keywords` and `blacklist` at run time.

- **Comments** contain no keyword (nobody writes the brand name replying to our
  own post), so they inherit `keyword_matched` from the parent post's caption.
  A caption matching nothing falls back to whichever keyword claims our own
  handle. This is why a comment can carry `shaiful-subhan` — it sat on a post
  about him, so it reaches that keyword's tenants.
- **@-tagged posts**: the tag lives in post metadata, not caption text, so
  caption matching alone misses it. Appearing on `/me/tags` *is* the match, and
  it resolves through the keyword that claims `uemedgenta` as an alias. **Keep
  that alias on the UEM Edgenta keyword** or tagged posts stop being attributed.
- **Blocked handles** are derived from `blacklist`: `owned` rows contribute
  their first domain label (`uemedgenta.com` → `uemedgenta`) and any row with a
  path contributes its last segment (`instagram.com/uemgroup` → `uemgroup`).
  Add new ones to the table, never to the script.
- `sentiment_confidence` **0.3 exactly** is the sentinel for "AFINN only, not
  yet judged by Claude". Re-running ingest preserves any other value, including
  a deliberately low one — flagging a row as too ambiguous to call is a
  decision and must not be reverted to the baseline.

## Notification bell and user identity

**Alerts are per event, in a window.** `TopBar` used to render every
`riskLevel === 'high'` mention ever ingested, one row per article: Infra opened
to 41 unread, of which 3 were from the last 30 days, and one Kulai pile-up
accounted for nine of them because dedup is on `url` and eight outlets carried
it. A ransomware story naming PLUS Malaysia sat at position 28, styled
identically to a lorry collision.

`utils/alerts.js → buildAlertClusters()` fixes both: a fixed
**`ALERT_WINDOW_DAYS`** (30) bound, and one alert per *event*, grouping
headlines by token overlap within 3 days. The window is deliberately fixed
rather than following the TopBar date filter — a notification count that moves
when you change a chart filter is not a notification count. Clustering is tuned
to **under-merge**: missing a merge costs a duplicate row, over-merging hides an
event. Read state applies to the whole cluster (`cluster.ids`), so
acknowledging one outlet's copy acknowledges the syndicated pile.

**The window has to be visible.** 41 high-risk Infra mentions minus the 3 inside
the window leaves 38 that the bell silently stopped showing — and "Show
completed" cannot explain them, because they are not completed, they are out of
window. A filter that leaves no trace of what it removed is indistinguishable
from data loss, so the dropdown ends with `Showing the last 30 days. 38 older
high risk mentions →`, linking to the Mentions Explorer with the risk filter
applied. `countOlderAlerts()` sits next to `buildAlertClusters()` so both read
the same bound.

Still true and still wrong:

**Three states, three homes** (migration `008`), because none can be inferred
from another and `localStorage` could hold none of them:

| Fact | Where | Scope |
|---|---|---|
| viewed | `mention_views` | per person, permanent — the audit trail, and what the avatars draw |
| read | `mention_alert_state.read_at` | per **(mention, department)** — drives the badge |
| handled | `mention_alert_state.handled_at` | per tenant, explicit, high-risk only |

Read is keyed per department because one mention reaches several tenants through
`keyword_matched` — a story CCD has read must still be unread for Infra. Read
un-badges an item for the whole tenant but **hides nothing**: read rows stay in
the All tab carrying the first viewer's face, so the second person to log in can
still find everything and see who got there first.

**Done is an action, not a glance.** The bell lists only *outstanding* work: an
alert leaves the list when someone marks it **handled**, a review item when
someone **resolves** it, and a "Show completed" checkbox brings the finished ones
back, dimmed, with who did it. Tab counts and the badge count outstanding items,
so they measure work rather than rows on screen.

Read state still exists and still drives the avatars and `read_by`, but it
deliberately **clears nothing** — reading a fatal-crash report is not the same as
deciding nothing needs doing about it. Handling, however, *does* imply reading:
`set_alert_handled` writes `read_at` too, because an item that showed "Handled"
next to an unread dot was a state that should never have existed.

**Undo puts an alert back, all the way.** Un-handling clears `read_at` as well as
`handled_at`, so the row returns to the list wearing the unread dot — the state
that makes people look — rather than a quiet "seen" tick. The permanent record of
who looked is in `mention_views` and is untouched, since `read_at` is only badge
and dot state.

**There is no bulk dismiss.** "Mark all read" was removed: every row in this list
is one decision, and a single button that clears all of them is exactly how the
one that mattered gets lost. `markViewed` (opening one item) is the only thing
that stamps a face.

Writes are optimistic and go through SECURITY DEFINER functions that check
`can_touch_department()`; a failed write logs and triggers
`reloadNotificationState()`, so the UI corrects itself rather than leaving
someone believing an alert was acknowledged.

**`review_queue`** is the Needs Review tab, keyed `(mention_id, department,
reason)` — one mention can need two different things, which a boolean on
`mentions` cannot express. Reasons are `unreadable | ambiguous_sentiment |
risk_unhandled | out_of_scope`. The monitoring routine writes it in its Step 6B;
the `ON CONFLICT DO NOTHING` there is load-bearing, because a resolved row must
not reappear the next morning.

**What belongs in Needs Review.** A row qualifies only if all three hold:

1. the routine already **tried** and could not decide — not work it skipped;
2. a person can resolve it **from the dashboard**;
3. resolving it writes back to **our data** (sentiment, exclusion, a keyword),
   not to the outside world.

Three things are excluded by that test, and each was in the queue at some point
before it was applied:

- **Wrong dates** fail (1). Step 1D recovers the date itself — URL path, then the
  page byline, then a title search for a syndicated copy when the page 403s. All
  seven rows in the first backfill were recoverable that way, so the queue had
  been handing people work the routine had simply skipped. A date that survives
  all three signals is *reported*, not queued.
- **`risk_unhandled`** fails (3). Deciding whether to respond to a fatal crash is
  a comms action, and high-risk alerts already carry `handled_at`. Queueing it
  put one story in two tabs with two separate states — marking it handled in
  Alerts left the Needs Review row untouched. **A high-risk mention is an alert,
  full stop.**
- **The thin-body backlog** (294 rows) is the routine's own Step 1C queue,
  cleared 30 a day.

The surviving reasons are all data decisions: `ambiguous_sentiment`,
`unreadable`, `out_of_scope`.

**The answer closes the row from wherever it is given.** A bare "Resolve" that
changed nothing was hollow — the mention kept its machine-guessed label. But
putting the decision in the row (three sentiment buttons per item) made the list
unreadable, so the row keeps one quiet action and a **trigger on `mentions`**
(`close_review_on_analyst_decision`) does the closing: set `analyst_sentiment`,
`analyst_excluded` or `analyst_reviewed` anywhere — the analyst panel in the
Mentions Explorer, the routine, a SQL fix — and matching open rows close with the
decision recorded as their `resolution`.

That also handles multi-tenant for free: the override lives on the mention, so
one write closes CCD's and UEM Group's rows together, in SQL, without the clicker
needing rights over the other tenant's row.

"Resolve" in the bell therefore means **"I looked, nothing needs changing"** —
a real answer, and the only one left that writes nothing. Undo
(`unresolve_review_item`) reopens just that row and deliberately does **not**
touch the mention: a queue row is not a mandate to erase somebody's sentiment
override.

Each review row is presented as **Claude asking a question**, not as a category:
a robot icon on a `#FAFAFA` panel (translucent white in dark mode, where a
near-white block would glare), the first-person line ("I couldn't tell whether
this is positive or negative"), then the row's own `needed` ask underneath ("Read
it and set the sentiment"), and the outlet on the footer line the way an alert
carries it — resolved through `getOutletName()` from the URL, since review rows
have no author record and there is one definition of "which source is this". The first-person lines live in `REASON_QUESTIONS` in
`NotificationRows.jsx`, not in the database — three reasons, three sentences, one
voice that cannot drift row to row, and nothing repeated across hundreds of rows.
A `reason` outside the three renders a generic fallback and the reader loses the
question, so adding a reason means adding its sentence in the same commit.

**Dev caveat:** `VITE_DEV_NO_AUTH=true` uses the service-role key, so reads work
but `mark_mentions_viewed` cannot (there is no `auth.email()` to attribute a
view to). Verifying the write paths needs a real Microsoft login.

**Identity comes from the user's own login, not the directory.**
`app_users.full_name / avatar_color / avatar_url` (migration `007`) exist so a
colleague can be rendered as a face or initials. The photo comes from Microsoft
Graph, and the timing is the whole design: Supabase exposes `provider_token`
only on the session right after the OAuth redirect, and Azure returns no
provider refresh token, so it is gone after the first session refresh.
`AuthContext` therefore harvests **your own** photo once per sign-in
(`/me/photos/96x96/$value`, `User.Read`, user-consentable) and writes it to
`app_users`; everyone else reads the stored copy. Reading colleagues' photos
live would need `User.ReadBasic.All` and an Entra admin's consent.

- `sync_my_profile()` is the only write path — RLS still restricts `app_users`
  UPDATE to super admins, because a self-update policy would let a user write
  their own `role`. The function touches three columns of the caller's own row.
- `list_directory_avatars()` is the read path for non-admins, exposing the
  presentational columns only, scoped to the caller's department.
- `admin_list_app_users()` is a fixed-column function: **new columns are
  invisible to the Admin page until they are named in it**, and Postgres will
  not widen the return type in place, so changing it needs a drop and recreate.
- A missing photo is normal, not a failure. Initials are the design: colour is
  derived from an email hash so everyone is distinct from day one, with an
  optional override in Admin → User Management.

## Multi-tenancy (departments)

A **tenant** (called a "department" in the UI) owns keyword tags, folder mappings,
users and its own AI Digest. The tenant list lives in the **`tenants` table** — it is
NOT hardcoded. `src/context/AuthContext.jsx` loads it at session start and exposes
`departments` (active names) + `tenants` (full rows) from `useAuth()`.
`FALLBACK_DEPARTMENTS` in that file is only used when the table can't be read.

### Adding a new tenant
1. **Admin → Departments → Add Department** (super admin only)
2. Point the sidebar **department switcher** at the new tenant
3. **Keyword Manager** → New Group, then Add Keyword — keyword and folder management
   is always per-tenant there, never from the Admin page
4. `npm run ingest` picks up the new keywords automatically (keywords load from Supabase)
5. `scripts/generate-digest.js` discovers tenants from `keyword_tenants`, so the new
   tenant gets its own digest once it has keywords

Rename/deactivate/delete also live in Admin → Departments. Deleting refuses while
users are still assigned; it cascades the tenant's folder mappings, keyword tags and
digests, deactivates keywords no other tenant tracks, and **never** deletes mentions.

**Do not reintroduce a hardcoded department list.** `app_users` and
`department_group_access` used to carry `CHECK (department IN ('CCD','Infra'))`;
`db/migrations/003_tenants.sql` drops those in favour of FKs to `tenants(name)`.

Note: `src/data/fallbackKeywords.js` is a CCD-shaped offline fallback and is not
tenant-aware — don't add other tenants' keywords to it.

## Adding a new keyword

1. **Supabase** — insert into `keywords` table, linked to the correct `keyword_groups` row, with `is_active = true`
2. **`src/data/fallbackKeywords.js`** — add the same keyword/group to keep the offline fallback in sync
3. **Run ingest** — `npm run ingest` loads keywords dynamically from Supabase, so no code changes needed
4. **Follow the full post-ingest workflow** (fix dates, summaries, delete junk, reload)

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

### Source strategy and Serper credits

`mentions.source` records **how we found it**; `mentions.platform` records
**where it was published**. Only platform is user-facing as a channel. The
Sources filter groups vendor keys behind readable labels in
`FilterBar.jsx → SOURCE_GROUPS` — grouping happens in the UI, not by rewriting
`source`, so provenance survives and regrouping is a one-line change.

| Group shown | Underlying keys |
|---|---|
| Claude Search | `claude_search` |
| Google Search | `serper`, `serper_news`, `serper_social`, `google_cse` |
| News APIs | `google_news_rapidapi`, `gnews`, `realtimesnews`, `worldnews`, `google_alerts`, `rss_my` |
| Twitter / X | `twitter135` |
| IG @Mentions / IG Comments | `instagram_tags`, `instagram_comments` |

**Serper is metered — 2,500 prepaid credits, then it costs money.** One credit
per API call. It is deliberately the most restricted source:

- **Social runs, and must keep running.** It is the ONLY source of LinkedIn,
  Facebook and YouTube — 105/105 LinkedIn rows came from it. Losing it loses
  those channels entirely.
- **News runs as a cheap cross-check only.** Serper supplied 14 of 337 news
  rows; `claude_search` already covers that ground. Kept because it does catch
  the occasional Malay-language piece Claude misses.
- Both are capped to **page 1, English, primary keyword terms only** (no
  aliases). That is ~2 credits per keyword per run, versus ~120 credits for a
  full run under the original config.
- The run logs its estimated credit cost before spending anything.

All other news APIs (google-news13, real-time-news-data, worldnewsapi) and the
Google Alerts RSS feeds were verified live on 2026-09-02 and all return HTTP
200. Where a source looks dead, the cause is almost always that `npm run
ingest` has not been run — not a broken key.

## Server-side ingest (Edge Functions + pg_cron)

`scripts/ingest.js` only runs when a human has a shell, and the daily routine has
none — that is why every API source went from May/June 2026 to September without
saving a row. The work now lives in `supabase/functions/ingest-apis` and
`supabase/functions/ingest-instagram`, triggered by pg_cron (`db/migrations/006_ingest_cron.sql`).
`ingest_runs` — not the HTTP response — is the source of truth for a run's result.

- **`?group=` is REQUIRED.** `social`, `news`, `twitter` or `all`; a bare call is
  rejected with 400. It used to default to `all`, so an accidental invocation
  silently repeated the three grouped cron jobs and spent 14 Serper credits.
- **Attribution: believe the text, not the query.** The searched keyword is added
  to `keyword_matched` ONLY where the row's text is a truncated snippet (Serper
  LinkedIn/YouTube results legitimately omit the searched phrase — requiring it
  discarded 64 of 64). Where the full text is in hand (`twitter135`, `worldnews`,
  and anything News/Web), an absent keyword means the query matched something
  else and the row is dropped. Adding it unconditionally put a keyword that
  appeared nowhere in the row on 222 of 915 keyword links.
- **Sanitise AFTER truncating.** `clean()` strips lone surrogates; slicing to 500
  chars afterwards splits an emoji pair and recreates one, which Postgres rejects
  as `invalid input syntax for type json`. One tweet failed four runs that way.
- **`toRow` returns `null`** for rejected rows, so any `.filter(r => r.url)` over
  its output must be `r?.url` — the unguarded version threw and discarded the
  whole keyword's results for that source.
- `platform.ts` in the function directory is a **verbatim copy** of
  `scripts/lib/platform.js`. Edge Functions cannot import across directories.
  Change one, change the other, or the same outlet lands in two channels.
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

**Step 4a — Re-score Instagram sentiment with Claude**
`instagram_comments` and `instagram_tags` rows are written with
`sentiment_confidence: 0.3` because AFINN cannot read them: it is an
English-word lexicon, and these comments are emoji-heavy and roughly half
Malay. It scores "😍😍😍", "Tahniah" and "Sangat membantu bila diperlukan"
all as neutral. Fetch rows where `sentiment_confidence < 0.5`, judge each one
directly, and PATCH back `sentiment_label`, `sentiment_score`, a real
`sentiment_confidence`, and an English gloss in `full_text` for non-English or
emoji-only text. Leave genuinely ambiguous rows at confidence ≤ 0.4 so a human
reviews them rather than trusting a guess.

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
