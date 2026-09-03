import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Instagram, Facebook, Heart, MessageCircle, Share2, Bookmark, Eye, Users,
  ArrowUpRight, ArrowDownRight, Minus, Activity,
} from 'lucide-react'
import { fetchSocialPosts } from '../services/apiService'
import { useSocialFilter } from '../context/SocialFilterContext'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import clsx from 'clsx'

const BRAND = {
  primary: '#2940BE',
  positive: '#19C9A5',
  negative: '#E97132',
  neutral: '#1490EA',
  mixed: '#732BCC',
}

/**
 * Per-platform differences. The feed body is identical for every owned
 * account, so a platform only supplies its identity plus the handful of
 * metrics it actually reports: Facebook has no saves, and its reach stays 0
 * until the Meta app is granted read_insights.
 */
const PLATFORMS = {
  instagram: {
    label: 'Instagram',
    Icon: Instagram,
    hasSaves: true,
    handlePrefix: '@',
    profileUrl: (handle) => `https://www.instagram.com/${handle}/`,
    ingestCmd: 'node scripts/ingest-instagram-owned.js',
    // Instagram posts weekly, so the shared default range is fine.
    defaultPreset: null,
  },
  facebook: {
    label: 'Facebook',
    Icon: Facebook,
    hasSaves: false,
    handlePrefix: '',
    profileUrl: (handle) => `https://www.facebook.com/${handle}`,
    ingestCmd: 'node scripts/ingest-facebook-owned.js',
    // The page has been dormant since Nov 2024, so every rolling window is
    // empty and the feed would open on "no posts" every time.
    defaultPreset: 'all',
  },
}

const SORTS = [
  { key: 'recent', label: 'Most recent' },
  { key: 'engagement', label: 'Most engagement' },
  { key: 'comments', label: 'Most commented' },
  { key: 'reach', label: 'Most reach', needsReach: true },
  { key: 'rate', label: 'Best engagement rate', needsReach: true },
]

const PAGE_SIZE = 24

const nf = (n) => (n ?? 0).toLocaleString()

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const TYPE_LABEL = {
  REEL: 'Reel',
  VIDEO: 'Video',
  IMAGE: 'Image',
  CAROUSEL_ALBUM: 'Carousel',
  LINK: 'Link',
  STATUS: 'Post',
}

/* ------------------------------------------------------------------ */

function StatCard({ icon: Icon, label, value, sub, color = BRAND.primary }) {
  return (
    <Card className="border-hairline bg-surface-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-muted truncate">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-ink tabular-nums">{value}</div>
            {sub && <div className="mt-0.5 text-xs text-muted truncate">{sub}</div>}
          </div>
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${color}18` }}
          >
            <Icon size={16} style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TrendPill({ current, previous }) {
  if (previous == null || previous === 0) return null
  const delta = ((current - previous) / previous) * 100
  const flat = Math.abs(delta) < 1
  const up = delta > 0
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  const color = flat ? '#787881' : up ? BRAND.positive : BRAND.negative
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium" style={{ color }}>
      <Icon size={13} />
      {flat ? 'flat' : `${Math.abs(delta).toFixed(0)}%`}
    </span>
  )
}

/**
 * A metric shown as icon + number. The icon alone is ambiguous, so the label
 * (and an optional longer hint) live in a tooltip rather than on the card,
 * which keeps six metrics readable inside a narrow tile.
 */
function IconStat({ icon: Icon, label, hint, value, color, valueClassName }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 text-body cursor-default">
          <Icon size={13} style={color ? { color } : undefined} className={color ? undefined : 'text-muted'} />
          <span className={clsx('tabular-nums', valueClassName)} style={color ? { color } : undefined}>
            {value}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-muted mt-0.5 max-w-[180px]">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Loading state. Mirrors the real layout — handle, four stat tiles, the sort
 * row and a grid of cards — so the page doesn't jump when the data lands. A
 * centred spinner would be less work but shifts everything on arrival.
 */
function FeedSkeleton({ cfg }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading {cfg.label} feed…</span>

      <Skeleton className="h-3.5 w-32" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="border-hairline bg-surface-card">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-16" />
                </div>
                <Skeleton className="w-9 h-9 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-3 w-12" />
        {[64, 92, 88, 76].map((w, i) => (
          <Skeleton key={i} className="h-6" style={{ width: w }} />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {Array.from({ length: 10 }, (_, i) => (
          <Card key={i} className="overflow-hidden flex flex-col border-hairline bg-surface-card">
            {/* The real card leads with a square image, so the placeholder must
                too — this is most of the card's height. */}
            <Skeleton className="aspect-square w-full rounded-none" />
            <CardContent className="p-3 flex-1 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-10" />
              </div>
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-2.5 w-full" />
                <Skeleton className="h-2.5 w-[85%]" />
              </div>
              <div className="grid grid-cols-3 gap-y-1.5 gap-x-2 pt-2 border-t border-hairline">
                {Array.from({ length: 4 }, (_, j) => (
                  <Skeleton key={j} className="h-3 w-10" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

/**
 * A dormant account lands here on every default range — Facebook stopped
 * posting in 2024, so "last 3 months" is legitimately empty. A bare "no posts
 * match" reads as a broken integration, so say where the posts actually are
 * and offer the jump rather than making the reader find the All tab.
 */
function EmptyRange({ posts, searchQuery, onShowAll }) {
  const searching = searchQuery.trim().length > 0
  const newest = posts.reduce((max, p) => {
    const t = new Date(p.publishedAt).getTime()
    return Number.isFinite(t) && t > max ? t : max
  }, -Infinity)
  const haveOutside = posts.length > 0 && Number.isFinite(newest)

  return (
    <div className="py-12 text-center">
      <p className="text-sm text-muted">
        No posts in this date range{searching ? ' matching your search' : ''}.
      </p>
      {haveOutside && (
        <p className="mt-1.5 text-xs text-muted">
          {nf(posts.length)} post{posts.length === 1 ? '' : 's'} loaded — the most recent
          is from {fmtDate(new Date(newest).toISOString())}.
        </p>
      )}
      {haveOutside && !searching && (
        <button
          onClick={onShowAll}
          className="mt-3 px-3 py-1.5 rounded-md text-xs text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: BRAND.primary }}
        >
          Show all posts
        </button>
      )}
    </div>
  )
}

function PostCard({ post, cfg, showReach }) {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <Card className="overflow-hidden flex flex-col border-hairline bg-surface-card">
      <a
        href={post.permalink}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block aspect-square overflow-hidden bg-surface-strong group"
      >
        {post.thumbnail && !imgFailed ? (
          <img
            src={post.thumbnail}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
        ) : (
          // Meta CDN links are signed and expire — degrade to a platform tile
          // rather than a broken image.
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <cfg.Icon size={22} className="text-muted flex-shrink-0" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge variant="secondary" className="text-[0.625rem] bg-black/60 text-white border-0">
            {TYPE_LABEL[post.type] || post.type}
          </Badge>
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ArrowUpRight size={26} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </a>

      <CardContent className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">{fmtDate(post.publishedAt)}</span>
          {showReach && post.engagementRate != null && (
            <IconStat
              icon={Activity}
              label="Engagement rate"
              hint="Likes, comments, shares and saves as a share of reach"
              value={`${post.engagementRate.toFixed(1)}%`}
              valueClassName="font-semibold"
              color={post.engagementRate >= 5 ? BRAND.positive : BRAND.primary}
            />
          )}
        </div>

        <p className="text-xs text-body line-clamp-3 flex-1">
          {post.caption || <span className="italic text-muted">No caption</span>}
        </p>

        <div className="grid grid-cols-3 gap-y-1.5 gap-x-2 pt-2 border-t border-hairline text-xs">
          <IconStat
            icon={Heart}
            label={cfg.hasSaves ? 'Likes' : 'Reactions'}
            hint={cfg.hasSaves ? undefined : 'Every reaction type — the figure Facebook shows on the post'}
            value={nf(post.likes)}
          />
          <IconStat icon={MessageCircle} label="Comments" value={nf(post.comments)} />
          {showReach && (
            <IconStat
              icon={Users} label="Reach"
              hint="Unique accounts that saw this post"
              value={nf(post.reach)}
            />
          )}
          <IconStat icon={Share2} label="Shares" value={nf(post.shares)} />
          {cfg.hasSaves && <IconStat icon={Bookmark} label="Saves" value={nf(post.saves)} />}
          {post.views > 0 && <IconStat icon={Eye} label="Views" value={nf(post.views)} />}
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */

export default function SocialFeed({ platform = 'instagram' }) {
  const cfg = PLATFORMS[platform] ?? PLATFORMS.instagram
  const [posts, setPosts] = useState([])
  const [state, setState] = useState('loading')
  const [sort, setSort] = useState('recent')
  // Render a page at a time — 'All' can pull years of posts, and each card
  // loads a CDN image, so mounting the lot at once is a real cost.
  const [visible, setVisible] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)
  // Date window and search come from the TopBar, same controls as the mentions pages.
  const {
    dateRange, searchQuery, setDatePreset,
    posts: registeredPosts, setPosts: registerPosts,
  } = useSocialFilter()

  useEffect(() => {
    let cancelled = false
    setState('loading')
    ;(async () => {
      const { posts, status } = await fetchSocialPosts({ platform })
      if (cancelled) return
      setPosts(posts)
      setState(status)
    })()
    return () => { cancelled = true }
  }, [platform])

  // Hand the loaded posts to the TopBar's date picker so it can mark the days
  // that have posts, the way allMentions does on the mentions side.
  useEffect(() => { registerPosts(posts) }, [posts, registerPosts])

  // Platforms that publish rarely open on their full history instead of the
  // shared rolling default. This has to wait for the posts to reach the
  // context, because 'all' resolves against the oldest row registered there —
  // firing it earlier would land on the 10-year fallback span.
  const defaultedFor = useRef(null)
  useEffect(() => {
    if (!cfg.defaultPreset || defaultedFor.current === platform) return
    if (!registeredPosts.length) return
    defaultedFor.current = platform
    setDatePreset(cfg.defaultPreset)
  }, [platform, cfg.defaultPreset, registeredPosts.length, setDatePreset])

  // Reach is a Meta insights metric. Instagram reports it; Facebook will only
  // once the app holds read_insights. Decide from the data rather than from a
  // per-platform flag, so the reach column lights up on its own the day the
  // permission lands instead of needing a code change.
  const hasReach = useMemo(() => posts.some(p => p.reach > 0), [posts])

  const start = dateRange.start.getTime()
  const end = dateRange.end.getTime()

  // Current window plus the one immediately before it, so the header stats can
  // show movement rather than a number with no reference point.
  const { windowed, previous } = useMemo(() => {
    const span = end - start
    const inRange = (p, from, to) => {
      const t = new Date(p.publishedAt).getTime()
      return t >= from && t <= to
    }
    const q = searchQuery.trim().toLowerCase()
    const matches = (p) =>
      !q ||
      (p.caption || '').toLowerCase().includes(q) ||
      (p.handle || '').toLowerCase().includes(q) ||
      (p.mediaType || '').toLowerCase().includes(q)
    return {
      windowed: posts.filter(p => inRange(p, start, end) && matches(p)),
      previous: posts.filter(p => inRange(p, start - span, start - 1) && matches(p)),
    }
  }, [posts, start, end, searchQuery])

  const sorted = useMemo(() => {
    const list = [...windowed]
    switch (sort) {
      case 'engagement': return list.sort((a, b) => b.engagements - a.engagements)
      case 'comments': return list.sort((a, b) => b.comments - a.comments)
      case 'reach': return list.sort((a, b) => b.reach - a.reach)
      case 'rate': return list.sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1))
      default: return list.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    }
  }, [windowed, sort])

  // Any change to what's being listed starts the paging over.
  useEffect(() => { setVisible(PAGE_SIZE) }, [sorted])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(v => Math.min(v + PAGE_SIZE, sorted.length))
      },
      // Start fetching the next page slightly before the sentinel is on screen.
      { rootMargin: '400px' }
    )
    io.observe(node)
    return () => io.disconnect()
  }, [sorted.length])

  const totals = useMemo(() => {
    const sum = (list, k) => list.reduce((s, p) => s + (p[k] || 0), 0)
    const rate = (list) => {
      const reach = sum(list, 'reach')
      return reach > 0 ? (sum(list, 'engagements') / reach) * 100 : 0
    }
    return {
      posts: windowed.length,
      prevPosts: previous.length,
      comments: sum(windowed, 'comments'),
      prevComments: sum(previous, 'comments'),
      shares: sum(windowed, 'shares'),
      prevShares: sum(previous, 'shares'),
      reach: sum(windowed, 'reach'),
      prevReach: sum(previous, 'reach'),
      engagements: sum(windowed, 'engagements'),
      prevEngagements: sum(previous, 'engagements'),
      rate: rate(windowed),
      prevRate: rate(previous),
    }
  }, [windowed, previous])

  // A reach-less platform can't offer these orderings; drop back rather than
  // leaving the list sorted by a button that is no longer rendered.
  useEffect(() => {
    if (!hasReach && (sort === 'reach' || sort === 'rate')) setSort('recent')
  }, [hasReach, sort])

  /* ---------------- states ---------------- */

  if (state === 'loading') return <FeedSkeleton cfg={cfg} />

  if (state === 'error' || state === 'empty') {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <cfg.Icon size={28} className="mx-auto text-muted" />
        <h2 className="mt-4 text-base font-semibold text-ink">No {cfg.label} posts yet</h2>
        <p className="mt-2 text-sm text-muted">
          Run the ingest to pull our own posts and engagement figures from {cfg.label}.
        </p>
        <code className="mt-4 inline-block px-3 py-2 rounded-md bg-surface-strong text-xs text-body">
          {cfg.ingestCmd}
        </code>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-5">
      {/* Header */}
      {/* No page heading — the TopBar already names the platform. */}
      <p className="text-xs">
        {(() => {
          // Built from the handle rather than hardcoded, so the link follows
          // the account the posts actually came from.
          const handle = posts[0]?.handle || 'uemedgenta'
          return (
            <a
              href={cfg.profileUrl(handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-muted no-underline hover:no-underline hover:text-[#2940BE] dark:hover:text-[#6B80FF] transition-colors"
            >
              {cfg.handlePrefix}{handle}
              <ArrowUpRight size={12} />
            </a>
          )
        })()}
      </p>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={cfg.Icon} label="Posts published" value={nf(totals.posts)}
          sub={<TrendPill current={totals.posts} previous={totals.prevPosts} />}
        />
        <StatCard
          icon={Heart} label="Total engagements" value={nf(totals.engagements)} color={BRAND.mixed}
          sub={<TrendPill current={totals.engagements} previous={totals.prevEngagements} />}
        />
        {/* Reach and the rate derived from it need insights. Where they are
            absent, show the two counts we do have rather than a pair of
            zeroes that read as "nobody saw this". */}
        {hasReach ? (
          <>
            <StatCard
              icon={Users} label="Total reach" value={nf(totals.reach)} color={BRAND.neutral}
              sub={<TrendPill current={totals.reach} previous={totals.prevReach} />}
            />
            <StatCard
              icon={ArrowUpRight} label="Engagement rate" value={`${totals.rate.toFixed(1)}%`} color={BRAND.positive}
              sub={<TrendPill current={totals.rate} previous={totals.prevRate} />}
            />
          </>
        ) : (
          <>
            <StatCard
              icon={MessageCircle} label="Comments" value={nf(totals.comments)} color={BRAND.neutral}
              sub={<TrendPill current={totals.comments} previous={totals.prevComments} />}
            />
            <StatCard
              icon={Share2} label="Shares" value={nf(totals.shares)} color={BRAND.positive}
              sub={<TrendPill current={totals.shares} previous={totals.prevShares} />}
            />
          </>
        )}
      </div>

      {/* Sort */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Sort by</span>
        {SORTS.filter(s => hasReach || !s.needsReach).map(s => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={clsx(
              'px-2.5 py-1 rounded-md text-xs transition-colors border',
              sort === s.key
                ? 'border-transparent text-white'
                : 'border-hairline text-body hover:bg-surface-strong'
            )}
            style={sort === s.key ? { backgroundColor: BRAND.primary } : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <EmptyRange
          posts={posts}
          searchQuery={searchQuery}
          onShowAll={() => setDatePreset('all')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {sorted.slice(0, visible).map(p => (
              <PostCard key={p.id} post={p} cfg={cfg} showReach={hasReach} />
            ))}
          </div>
          {visible < sorted.length && (
            // The observer does the work on scroll; the button is the fallback
            // for keyboard users and for tabs where IntersectionObserver is
            // suppressed (a backgrounded tab never reports an intersection).
            <div ref={sentinelRef} className="py-6 flex justify-center">
              <button
                onClick={() => setVisible(v => Math.min(v + PAGE_SIZE, sorted.length))}
                className="px-3 py-1.5 rounded-md border border-hairline text-xs text-body hover:bg-surface-strong transition-colors"
              >
                Load more — {visible} of {sorted.length}
              </button>
            </div>
          )}
        </>
      )}
    </div>
    </TooltipProvider>
  )
}
