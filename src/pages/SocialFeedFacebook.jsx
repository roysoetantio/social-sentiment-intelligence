import React from 'react'
import { Facebook, Info } from 'lucide-react'

const BRAND = { primary: '#2940BE' }

/**
 * Placeholder. Facebook owned-page posts are not ingested yet — there is no
 * `social_posts` row with a facebook platform, so rather than render an empty
 * copy of the Instagram page we say plainly that the source isn't wired up.
 */
export default function SocialFeedFacebook() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Facebook size={18} style={{ color: BRAND.primary }} />
          Facebook
        </h1>
        <p className="text-xs text-muted mt-0.5">Our own Facebook page posts</p>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-surface-card px-3.5 py-3">
        <Info size={15} className="text-muted mt-0.5 flex-shrink-0" />
        <p className="text-xs text-body leading-relaxed">
          Facebook is not connected yet. Once the page is linked to the Meta app and an ingest
          script lands, published posts and their engagement figures will appear here alongside
          Instagram.
        </p>
      </div>

      <div className="max-w-lg mx-auto py-16 text-center">
        <Facebook size={28} className="mx-auto text-muted" />
        <h2 className="mt-4 text-base font-semibold text-ink">No Facebook posts yet</h2>
        <p className="mt-2 text-sm text-muted">
          This page is a placeholder while the Facebook source is being set up.
        </p>
      </div>
    </div>
  )
}
