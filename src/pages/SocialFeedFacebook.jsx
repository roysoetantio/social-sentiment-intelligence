import React from 'react'
import SocialFeed from './SocialFeed'

/**
 * Facebook owned-page feed. The body is identical to Instagram's — same
 * `social_posts` table, same cards, same TopBar-driven date window — so this
 * is a thin platform binding rather than a second copy of the page.
 *
 * What differs is handled inside SocialFeed via its PLATFORMS entry: Facebook
 * has no saves, and reach/views stay hidden until the Meta app is granted
 * `read_insights` (see scripts/ingest-facebook-owned.js).
 */
export default function SocialFeedFacebook() {
  return <SocialFeed platform="facebook" />
}
