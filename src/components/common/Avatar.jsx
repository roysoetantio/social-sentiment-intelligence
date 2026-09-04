import React, { useState, useEffect } from 'react'
import clsx from 'clsx'

/**
 * A person, as a circle.
 *
 * Three sources of identity, in order: the Microsoft Graph photo harvested at
 * login, then initials from their display name, then initials from the email.
 * The photo is genuinely optional — plenty of Entra accounts have none — so
 * initials are the design, not a placeholder waiting for a real image.
 *
 * Colour is derived from the email unless an admin has overridden it, which
 * means every user has a stable, distinct colour from day one without anyone
 * assigning them.
 */

// Dark enough for white text, spread far enough around the wheel that two
// people in the same tenant rarely collide. Opens on the brand blue.
export const AVATAR_COLORS = [
  '#2940BE', '#1490EA', '#19C9A5', '#E97132', '#732BCC', '#D4326B',
  '#0F9D58', '#B45309', '#0E7490', '#7C3AED', '#BE123C', '#475569',
]

/** djb2 — stable across reloads and machines, which localStorage-free identity needs. */
const hash = (str) => {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

export const avatarColor = (user) =>
  user?.avatar_color || AVATAR_COLORS[hash(String(user?.email || '').toLowerCase()) % AVATAR_COLORS.length]

/**
 * Two letters. "Roy Soetantio" → RS; "roy.soetantio@…" → RS; "ops@…" → OP.
 * Never one letter unless there is genuinely only one character to work with.
 */
export const avatarInitials = (user) => {
  const name = (user?.full_name || '').trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  const local = String(user?.email || '?').split('@')[0]
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

export const displayName = (user) =>
  user?.full_name?.trim() || String(user?.email || '').split('@')[0]

export default function Avatar({ user, size = 28, className, title, ring = false }) {
  const [broken, setBroken] = useState(false)
  // Forget a previous failure when handed a different photo: React reuses this
  // component across rows, and a latched error would show initials for someone
  // whose picture is fine.
  useEffect(() => { setBroken(false) }, [user?.avatar_url])
  const showPhoto = user?.avatar_url && !broken

  return (
    <span
      title={title ?? displayName(user)}
      className={clsx(
        'inline-flex items-center justify-center rounded-full overflow-hidden select-none flex-shrink-0',
        ring && 'ring-2 ring-canvas',
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: showPhoto ? 'transparent' : avatarColor(user),
      }}
    >
      {showPhoto ? (
        <img
          src={user.avatar_url}
          alt={displayName(user)}
          onError={() => setBroken(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span
          className="font-semibold text-white leading-none"
          // Scales with the circle so one component covers a 20px stack and a
          // 64px profile header without a size-variant map.
          style={{ fontSize: Math.max(9, Math.round(size * 0.4)) }}
        >
          {avatarInitials(user)}
        </span>
      )}
    </span>
  )
}
