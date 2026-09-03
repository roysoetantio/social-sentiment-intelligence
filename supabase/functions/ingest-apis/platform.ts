// COPIED VERBATIM from scripts/lib/platform.js — keep in sync.
// Edge Functions cannot import from outside their own directory, so this is a
// deliberate duplicate. If you change one, change the other, or the same
// outlet will land in different channels depending on which writer saved it.

/** Social hosts win outright — a post is the post's channel, never "News". */
const SOCIAL_HOSTS = [
  [/(^|\.)twitter\.com$/, 'Twitter'],
  [/(^|\.)x\.com$/, 'Twitter'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)youtube\.com$/, 'YouTube'],
  [/(^|\.)youtu\.be$/, 'YouTube'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)threads\.net$/, 'Threads'],
  [/(^|\.)threads\.com$/, 'Threads'],
]

/**
 * Explicit news outlets and newswires seen in this database. Press-release
 * wires (Bernama, PR Newswire, Business Wire, Media OutReach) count as News —
 * they are how corporate announcements reach the press.
 */
const NEWS_DOMAINS = new Set([
  // Malaysia
  'theedgemalaysia.com', 'edgeprop.my', 'thestar.com.my', 'nst.com.my',
  'malaymail.com', 'bernama.com', 'bernamabiz.com', 'freemalaysiatoday.com',
  'thesun.my', 'thevibes.com', 'themalaysianreserve.com', 'malaysiakini.com',
  'bharian.com.my', 'sinarharian.com.my', 'sinardaily.my', 'businesstoday.com.my',
  'dagangnews.com', 'therakyatpost.com', 'tvsarawak.my', 'liveatpc.com',
  'pocketnews.com.my', 'theiskandarian.com', 'newswav.com', 'weirdkaya.com',
  'says.com', 'malaysiaworldnews.com', 'codeblue.galencentre.org',
  'digitalnewsasia.com', 'lowyat.net', 'soyacincau.com', 'paultan.org',
  'technave.com', 'marketing-interactive.com', 'malaysia.news.yahoo.com',
  // Regional / global
  'asiaone.com', 'asianews.network', 'techinasia.com', 'manilatimes.net',
  'macaubusiness.com', 'thailand-business-news.com', 'vir.com.vn',
  'thebruneian.news', 'minichart.com.sg', 'bloomberg.com', 'theexchangeasia.com',
  'ceoinsightsasia.com', 'livenews.co.nz', 'globalcioforum.com',
  'identityweek.net', 'fm-middleeast.com', 'globalhighways.com',
  'evinfrastructurenews.com', 'cittimagazine.co.uk', 'gecnewswire.com',
  'ad-hoc-news.de', 'world-today-news.com', 'swacenews.com',
  'panafricanvisions.com', 'businessdayghana.com', 'businessquest.co.ke',
  'iharare.com', 'news.microsoft.com',
  // Newswires / PR distribution
  'businesswire.com', 'prnewswire.co.uk', 'media-outreach.com',
  // Smaller Malaysian outlets, auto/lifestyle titles and broker notes. These
  // carry real reporting — they were only "Web" because they weren't listed.
  'smartinvestor.com.my', 'penjurupos.com', 'rnggt.com', 'portal.sina.com.hk',
  'dsf.my', 'artte.com.my', 'motorist.my', 'carz.com.my', 'mykmu.net',
  'bateriku.com', 'madeinmalaysia.com.my', 'wakeup.sg',
  'berjayasecurities.com.my',
  // Security/threat-intel outlets. Not conventional press, but they were the
  // only coverage of the Qilin ransomware attack on PLUS Malaysia — a
  // high-risk reputational item. Burying it under "Web" is worse than
  // calling an intel post news.
  'dexpose.io', 'netcrook.com', 'hookphish.com',
])

/**
 * Auto-generated listing pages, not commentary — an i3investor "EDGENTA (1368)
 * Overview" is a data page, not a mention. Listed explicitly so the NEWS_HINTS
 * regex cannot promote them. Rows from these are also marked
 * `analyst_excluded` so they stay out of the counts.
 */
const NOT_NEWS = new Set([
  'klsescreener.com', 'klse.i3investor.com', 'i3investor.com',
  'apps.apple.com',
])

/** Last resort for domains not seen before, so new outlets aren't all "Web". */
const NEWS_HINTS = /(^|[.-])(news|berita|daily|times|post|press|herald|journal|tribune|gazette|report|wire|media)([.-]|$)/i

export const classify = (rawUrl) => {
  let host
  try {
    host = new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return { platform: 'Web', reason: 'unparseable url' }
  }
  for (const [re, platform] of SOCIAL_HOSTS) {
    if (re.test(host)) return { platform, reason: 'social host', host }
  }
  if (NOT_NEWS.has(host)) return { platform: 'Web', reason: 'explicit not-news', host }
  if (NEWS_DOMAINS.has(host)) return { platform: 'News', reason: 'known outlet', host }
  if (NEWS_HINTS.test(host)) return { platform: 'News', reason: 'name heuristic', host }
  return { platform: 'Web', reason: 'default', host }
}
