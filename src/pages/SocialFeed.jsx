import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Instagram, Heart, MessageCircle, Share2, Bookmark, Eye, Users,
  ArrowUpRight, ArrowDownRight, Minus, Activity,
} from 'lucide-react'
import { fetchSocialPosts } from '../services/apiService'
import { useSocialFilter } from '../context/SocialFilterContext'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import clsx from 'clsx'

const BRAND = {
  primary: '#2940BE',
  positive: '#19C9A5',
  negative: '#E97132',
  neutral: '#1490EA',
  mixed: '#732BCC',
}

const SORTS = [
  { key: 'recent', label: 'Most recent' },
  { key: 'engagement', label: 'Most engagement' },
  { key: 'comments', label: 'Most commented' },
  { key: 'reach', label: 'Most reach' },
  { key: 'rate', label: 'Best engagement rate' },
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

function PostCard({ post }) {
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
          // Instagram CDN links are signed and expire — degrade to a caption
          // tile rather than a broken image.
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <Instagram size={22} className="text-muted flex-shrink-0" />
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
          {post.engagementRate != null && (
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
          <IconStat icon={Heart} label="Likes" value={nf(post.likes)} />
          <IconStat icon={MessageCircle} label="Comments" value={nf(post.comments)} />
          <IconStat
            icon={Users} label="Reach"
            hint="Unique accounts that saw this post"
            value={nf(post.reach)}
          />
          <IconStat icon={Share2} label="Shares" value={nf(post.shares)} />
          <IconStat icon={Bookmark} label="Saves" value={nf(post.saves)} />
          {post.views > 0 && <IconStat icon={Eye} label="Views" value={nf(post.views)} />}
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */

export default function SocialFeed() {
  const [posts, setPosts] = useState([])
  const [state, setState] = useState('loading')
  const [sort, setSort] = useState('recent')
  // Render a page at a time — 'All' can pull years of posts, and each card
  // loads a CDN image, so mounting the lot at once is a real cost.
  const [visible, setVisible] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)
  // Date window and search come from the TopBar, same controls as the mentions pages.
  const { dateRange, searchQuery, setPosts: registerPosts } = useSocialFilter()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { posts, status } = await fetchSocialPosts({ platform: 'instagram' })
      if (cancelled) return
      setPosts(posts)
      setState(status)
    })()
    return () => { cancelled = true }
  }, [])

  // Hand the loaded posts to the TopBar's date picker so it can mark the days
  // that have posts, the way allMentions does on the mentions side.
  useEffect(() => { registerPosts(posts) }, [posts, registerPosts])

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
      reach: sum(windowed, 'reach'),
      prevReach: sum(previous, 'reach'),
      engagements: sum(windowed, 'engagements'),
      prevEngagements: sum(previous, 'engagements'),
      rate: rate(windowed),
      prevRate: rate(previous),
    }
  }, [windowed, previous])

  /* ---------------- states ---------------- */

  if (state === 'loading') {
    return (
      <div className="py-16 text-center text-sm text-muted">Loading Instagram feed…</div>
    )
  }

  if (state === 'error' || state === 'empty') {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <Instagram size={28} className="mx-auto text-muted" />
        <h2 className="mt-4 text-base font-semibold text-ink">No Instagram posts yet</h2>
        <p className="mt-2 text-sm text-muted">
          Run the ingest to pull our own posts and engagement figures from Instagram.
        </p>
        <code className="mt-4 inline-block px-3 py-2 rounded-md bg-surface-strong text-xs text-body">
          node scripts/ingest-instagram-owned.js
        </code>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-5">
      {/* Header */}
      {/* No page heading — the TopBar already says "Instagram". */}
      <p className="text-xs">
        {(() => {
          // Built from the handle rather than hardcoded, so the link follows
          // the account the posts actually came from.
          const handle = posts[0]?.handle || 'uemedgenta'
          return (
            <a
              href={`https://www.instagram.com/${handle}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-muted no-underline hover:no-underline hover:text-[#2940BE] dark:hover:text-[#6B80FF] transition-colors"
            >
              @{handle}
              <ArrowUpRight size={12} />
            </a>
          )
        })()}
      </p>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Instagram} label="Posts published" value={nf(totals.posts)}
          sub={<TrendPill current={totals.posts} previous={totals.prevPosts} />}
        />
        <StatCard
          icon={Users} label="Total reach" value={nf(totals.reach)} color={BRAND.neutral}
          sub={<TrendPill current={totals.reach} previous={totals.prevReach} />}
        />
        <StatCard
          icon={Heart} label="Total engagements" value={nf(totals.engagements)} color={BRAND.mixed}
          sub={<TrendPill current={totals.engagements} previous={totals.prevEngagements} />}
        />
        <StatCard
          icon={ArrowUpRight} label="Engagement rate" value={`${totals.rate.toFixed(1)}%`} color={BRAND.positive}
          sub={<TrendPill current={totals.rate} previous={totals.prevRate} />}
        />
      </div>

      {/* Sort */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Sort by</span>
        {SORTS.map(s => (
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
        <div className="py-12 text-center text-sm text-muted">
          No posts match the selected date range{searchQuery.trim() ? ' and search' : ''}.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {sorted.slice(0, visible).map(p => <PostCard key={p.id} post={p} />)}
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
