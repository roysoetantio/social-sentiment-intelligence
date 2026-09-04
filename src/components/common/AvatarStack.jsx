import React from 'react'
import clsx from 'clsx'
import Avatar, { displayName } from './Avatar'

/**
 * Who has already looked at this.
 *
 * A face is the whole message — there is no "seen by 2 of 4" counter, because
 * the presence of the avatar already says it. Overflow collapses to "+N" rather
 * than shrinking faces past recognition.
 *
 * An empty stack is meaningful: nobody has opened this yet. It renders as
 * nothing at all, not as a placeholder, so a row with faces reads as different
 * at a glance.
 */
export default function AvatarStack({ viewers = [], directory, size = 18, max = 3, className }) {
  if (!viewers.length) return null

  const shown = viewers.slice(0, max)
  const extra = viewers.length - shown.length

  // One tooltip for the whole stack — "Viewed by A, B, C". Per-avatar tooltips
  // with timestamps meant hovering along a row of faces to read three separate
  // labels, when the only question is who.
  const nameOf = (v) => displayName(directory?.get(v.email) || { email: v.email })
  const tooltip = `Viewed by ${viewers.map(nameOf).join(', ')}`

  return (
    <span title={tooltip} className={clsx('inline-flex items-center flex-shrink-0', className)}>
      {shown.map((v, i) => (
        <Avatar
          key={v.email}
          user={directory?.get(v.email) || { email: v.email }}
          size={size}
          ring
          title=""
          className={i > 0 ? '-ml-1.5' : undefined}
        />
      ))}
      {extra > 0 && (
        <span
          className="-ml-1.5 inline-flex items-center justify-center rounded-full ring-2 ring-canvas bg-surface-strong text-[0.5625rem] font-semibold text-body"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}
