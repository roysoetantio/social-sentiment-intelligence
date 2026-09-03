import React from 'react'
import { cn } from '@/lib/utils'

/**
 * shadcn/ui Skeleton, with the placeholder fill pointed at our own
 * `surface-strong` token so it sits correctly in both themes (shadcn's default
 * `bg-muted` is a text colour in this project's palette).
 */
function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-surface-strong', className)}
      {...props}
    />
  )
}

export { Skeleton }
