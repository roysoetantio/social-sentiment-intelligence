import React from 'react'
import clsx from 'clsx'
import { Circle, CheckCircle, ShieldCheck, Check, Bot, Undo2 } from 'lucide-react'
import { format } from 'date-fns'
import { formatDateTime } from '../../utils/format'
import AvatarStack from '../common/AvatarStack'
import { getOutletName } from '../../utils/outlets'

/**
 * The two kinds of notification row.
 *
 * An alert says "look at this"; a review item says "do something". They share a
 * list, so each carries a tag in the All tab — without it a reader has to infer
 * which rules apply to the row in front of them.
 */

const TypeTag = ({ kind }) => (
  <span className={clsx(
    'inline-flex items-center h-4 px-1.5 rounded text-[0.5625rem] font-semibold uppercase tracking-wide',
    kind === 'alert'
      ? 'bg-red-600/10 text-red-700 dark:text-red-400'
      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  )}>
    {kind === 'alert' ? 'Alert' : 'Needs review'}
  </span>
)

/**
 * Needs Review is for rows the ROUTINE could not finish, where a person's answer
 * changes our data. A reason belongs here only if all three hold:
 *   1. the routine already tried and could not decide (not work it skipped);
 *   2. a person can resolve it from this dashboard;
 *   3. resolving it writes back to our data, not to the outside world.
 *
 * Two reasons were removed for failing that test. `undated` failed (1) — the
 * routine's Step 1D recovers dates itself. `risk_unhandled` failed (3): deciding
 * whether to respond to a fatal crash is a comms action, not a data fix, and it
 * already has its own `handled_at` on the alert. Having it in both lists meant
 * marking an item handled in Alerts left it sitting in Needs Review.
 */
// The reason, said out loud in the first person, because "AMBIGUOUS SENTIMENT"
// tells a reader the category and not the question. These live here rather than
// in the database: three reasons, three sentences, one voice that cannot drift
// row to row. Row-specific detail belongs in the item's own `needed` text.
const REASON_QUESTIONS = {
  ambiguous_sentiment: "I couldn't tell whether this is positive or negative.",
  unreadable: "I couldn't open this page to check it.",
  out_of_scope: "I found this, but it doesn't match any keyword you track.",
}

// Tinted panel so the question reads as a quoted aside rather than part of the
// headline. The light value is fixed at #FAFAFA by request; dark mode gets a
// translucent white instead, because a near-white block would glare there.
const AskedByClaude = ({ reason, needed }) => (
  <div className="flex items-start gap-2 mt-2 mb-1.5 rounded-md bg-[#FAFAFA] dark:bg-white/[0.06] px-2 py-1.5">
    <span className="flex-shrink-0 mt-px h-4 w-4 rounded-[0.25rem] bg-[#2940BE]/10 dark:bg-[#6B80FF]/15 flex items-center justify-center">
      <Bot size={11} className="text-[#2940BE] dark:text-[#6B80FF]" />
    </span>
    {/* One size, one colour: the question and the ask are a single remark, and
        two type styles made it read as two unrelated notes. */}
    <p className="min-w-0 text-[0.6875rem] leading-snug text-body">
      {REASON_QUESTIONS[reason] || 'I need a hand with this one.'}{needed ? ` ${needed}` : ''}
    </p>
  </div>
)

const UndoButton = ({ onClick, label }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    className="inline-flex items-center justify-center h-5 w-5 rounded text-muted hover:text-ink hover:bg-surface-strong transition-colors flex-shrink-0"
  >
    <Undo2 size={12} />
  </button>
)

/**
 * "Handled by Roy Soetantio · 4 Sep 2026, 3:39pm" — who and when.
 *
 * Only the outcome is green and emphasised; the timestamp is ordinary text,
 * because colouring it too made the whole line read as one loud status.
 */
const DoneBy = ({ verb, email, at, directory }) => {
  const who = email ? displayNameFor(email, directory) : null
  return (
    <span className="inline-flex items-center gap-1 text-[0.6875rem] min-w-0">
      <Check size={12} className="flex-shrink-0 text-[#0f9e80]" />
      <span className="font-medium text-[#0f9e80]">{verb}{who ? ` by ${who}` : ''}</span>
      {at && <span className="text-muted">· {format(new Date(at), 'd MMM yyyy, h:mmaaa')}</span>}
    </span>
  )
}

const displayNameFor = (email, directory) => {
  const user = directory?.get(email)
  return user?.full_name?.trim() || String(email).split('@')[0]
}

export function AlertRow({ cluster, isRead, isHandled, state, viewers, directory, showTag, onOpen, onHandled, onUnhandled }) {
  const m = cluster.lead
  const outlet = m.author?.name || m.author?.handle
  // High-risk items get an explicit handled state: read means someone glanced,
  // handled means someone dealt with it. A crash on a PLUS highway only ever
  // needs the former; a ransomware story needs the latter.
  const showFooter = viewers.length > 0 || m.riskLevel === 'high' || isHandled

  return (
    <div className={clsx(
      'rounded-lg border transition-colors bg-surface-card',
      isHandled ? 'border-hairline opacity-60' : 'border-hairline-strong dark:border-white/12'
    )}>
      <button
        onClick={onOpen}
        className="w-full text-left p-3 pb-2 rounded-t-lg hover:bg-gray-50 dark:hover:bg-white/12 transition-colors"
      >
        {showTag && <div className="mb-1.5"><TypeTag kind="alert" /></div>}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className={clsx('text-sm font-semibold line-clamp-2 flex-1', isHandled ? 'text-body' : 'text-ink')}>
            {m.text}
          </span>
          {/* The dot marks "nobody has looked at this yet". Once someone has, it
              becomes a quiet tick — the loud state is reserved for untouched. */}
          {isHandled
            ? null
            : isRead
              ? <CheckCircle size={13} className="text-muted flex-shrink-0 mt-0.5" />
              : <Circle size={8} className="text-red-600 flex-shrink-0 mt-1 fill-red-600" />
          }
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{formatDateTime(m.publishedAt)}</span>
          <span className="truncate ml-2">
            {cluster.outletCount > 1 ? `${outlet} +${cluster.outletCount - 1} more` : outlet}
          </span>
        </div>
      </button>

      {showFooter && (
        <div className="flex items-center justify-between gap-2 px-3 pb-2.5 min-h-6">
          <span className="flex items-center gap-2 min-w-0">
            {isHandled ? (
              <>
                <DoneBy verb="Handled" email={state?.handled_by} at={state?.handled_at} directory={directory} />
                {/* Undo, because a mis-click on a crisis alert should not be
                    permanent — set_alert_handled(false) clears it. */}
                <UndoButton onClick={onUnhandled} label="Mark as not handled" />
              </>
            ) : m.riskLevel === 'high' ? (
              <button
                onClick={onHandled}
                className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-body hover:text-ink transition-colors"
              >
                <ShieldCheck size={12} /> Mark handled
              </button>
            ) : null}
          </span>
          {/* Who has looked at it sits far right, hover for the name. */}
          <AvatarStack viewers={viewers} directory={directory} />
        </div>
      )}
    </div>
  )
}

export function ReviewRow({ item, viewers, directory, showTag, onOpen, onResolve, onUndo }) {
  const m = item.mention
  const isResolved = Boolean(item.resolved_at)
  // Same provenance line as an alert: which outlet this came from. Review rows
  // have no author record, so it resolves from the URL the way the leaderboard
  // does — one definition of "which source is this" for the whole app.
  const outlet = m?.url ? getOutletName(m.url) : (m?.source || null)

  return (
    <div className={clsx(
      'rounded-lg border bg-surface-card',
      isResolved ? 'border-hairline opacity-60' : 'border-hairline-strong dark:border-white/12'
    )}>
      <button
        onClick={onOpen}
        className="w-full text-left p-3 pb-2 rounded-t-lg hover:bg-gray-50 dark:hover:bg-white/12 transition-colors"
      >
        {showTag && <div className="mb-1.5"><TypeTag kind="review" /></div>}
        <span className="text-sm font-semibold text-ink line-clamp-2 block">
          {m?.text || 'Mention unavailable'}
        </span>
        <AskedByClaude reason={item.reason} needed={item.needed} />
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{m?.published_at ? formatDateTime(m.published_at) : ''}</span>
          {outlet && <span className="truncate ml-2">{outlet}</span>}
        </div>
      </button>

      <div className="flex items-center justify-between gap-2 px-3 pb-2.5 min-h-6">
        <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {isResolved ? (
            <>
              <DoneBy verb="Resolved" email={item.resolved_by} at={item.resolved_at} directory={directory} />
              <UndoButton onClick={onUndo} label="Reopen this item" />
            </>
          ) : (
            /* One action, not a row of choices. The actual decision is made by
               opening the mention — and a trigger on `mentions` closes this row
               the moment the analyst panel records it, so Resolve here means
               "I looked, nothing needs changing". */
            <button
              onClick={onResolve}
              className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-body hover:text-ink transition-colors"
            >
              <Check size={12} /> Resolve
            </button>
          )}
        </span>
        <AvatarStack viewers={viewers} directory={directory} />
      </div>
    </div>
  )
}
