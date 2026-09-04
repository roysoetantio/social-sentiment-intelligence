// Outlet identity and tiering.
//
// One copy of the domain → publication map lives here; apiService imports it
// rather than keeping its own, so a mention's author fallback and the Top
// Outlets leaderboard can never disagree about what an outlet is called.

export const DOMAIN_NAMES = {
  'thestar.com.my': 'The Star',
  'nst.com.my': 'New Straits Times',
  'malaymail.com': 'Malay Mail',
  'freemalaysiatoday.com': 'Free Malaysia Today',
  'malaysiakini.com': 'Malaysiakini',
  'theedgemalaysia.com': 'The Edge Malaysia',
  'theedgemarkets.com': 'The Edge Markets',
  'bernama.com': 'Bernama',
  'sinchew.com.my': 'Sin Chew Daily',
  'chinapress.com.my': 'China Press',
  'orientaldaily.com.my': 'Oriental Daily',
  'kwongwah.com.my': 'Kwong Wah',
  'hmetro.com.my': 'Harian Metro',
  'utusan.com.my': 'Utusan Malaysia',
  'bharian.com.my': 'Berita Harian',
  'astroawani.com': 'Astro Awani',
  'thesundaily.my': 'The Sun',
  'thesun.my': 'The Sun',
  'themalaysianreserve.com': 'The Malaysian Reserve',
  'sinarharian.com.my': 'Sinar Harian',
  'sinardaily.my': 'Sinar Daily',
  'therakyatpost.com': 'The Rakyat Post',
  'edgeprop.my': 'EdgeProp',
  'paultan.org': 'Paul Tan',
  'lowyat.net': 'Lowyat.NET',
  'says.com': 'SAYS',
  'newswav.com': 'Newswav',
  'asiaone.com': 'AsiaOne',
  'digitalnewsasia.com': 'Digital News Asia',
  'malaysiaworldnews.com': 'Malaysia World News',
  'media-outreach.com': 'Media OutReach',
  'businesswire.com': 'Business Wire',
  'prnewswire.co.uk': 'PR Newswire',
  'manilatimes.net': 'The Manila Times',
  'saudigazette.com.sa': 'Saudi Gazette',
  'thehindubusinessline.com': 'The Hindu BusinessLine',
  'vir.com.vn': 'Vietnam Investment Review',
  'aninews.in': 'ANI News',
  'businesstoday.com.my': 'BusinessToday',
  'focusmalaysia.my': 'Focus Malaysia',
  'thevibes.com': 'The Vibes',
  'dagangnews.com': 'DagangNews',
  'businesstimes.com.sg': 'Business Times',
  'straitstimes.com': 'The Straits Times',
  'channelnewsasia.com': 'CNA',
  'scmp.com': 'South China Morning Post',
  'reuters.com': 'Reuters',
  'bloomberg.com': 'Bloomberg',
  'cnbc.com': 'CNBC',
  'ft.com': 'Financial Times',
  'wsj.com': 'Wall Street Journal',
  'twitter.com': 'Twitter',
  'x.com': 'X (Twitter)',
  'linkedin.com': 'LinkedIn',
  'youtube.com': 'YouTube',
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'reddit.com': 'Reddit',
  'klsescreener.com': 'KLSE Screener',
  'i3investor.com': 'i3investor',
  'investalks.com': 'InvestAlks',
  'bursamalaysia.com': 'Bursa Malaysia',
  'stocknews.com': 'StockNews',
}

// Mirrors SOCIAL_HOSTS in scripts/lib/platform.js. Matched as suffixes, not
// exact hosts: LinkedIn serves country subdomains (es.linkedin.com), and an
// exact-match set filed those as if they were news outlets called "Es".
const SOCIAL_DOMAINS = [
  'twitter.com', 'x.com', 'linkedin.com', 'facebook.com', 'instagram.com',
  'reddit.com', 'youtube.com', 'youtu.be', 'threads.net', 'threads.com',
  'tiktok.com',
]

// Exact host, or any subdomain of it.
const matchesDomain = (hostname, domain) =>
  hostname === domain || hostname.endsWith(`.${domain}`)

const lookupBySuffix = (hostname, domains) =>
  domains.find(d => matchesDomain(hostname, d)) || null

// Tier 1 — national dailies, the national wire, and the international/business
// press a board actually recognises. Tier 2 — trade, investor and niche
// business titles. Everything else is Tier 3.
//
// These lists are editorial, not technical: adding a domain here changes what
// "Tier 1 coverage" means on the Overview, so keep them deliberate.
export const TIER_1_DOMAINS = new Set([
  'bernama.com',
  'thestar.com.my',
  'nst.com.my',
  'theedgemalaysia.com',
  'theedgemarkets.com',
  'malaysiakini.com',
  'freemalaysiatoday.com',
  'malaymail.com',
  'thesundaily.my',
  'thesun.my',
  'themalaysianreserve.com',
  'sinarharian.com.my',
  'bharian.com.my',
  'utusan.com.my',
  'hmetro.com.my',
  'astroawani.com',
  'sinchew.com.my',
  'chinapress.com.my',
  'orientaldaily.com.my',
  'kwongwah.com.my',
  'nanyang.com',
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'cnbc.com',
  'channelnewsasia.com',
  'straitstimes.com',
  'businesstimes.com.sg',
  'scmp.com',
])

export const TIER_2_DOMAINS = new Set([
  'businesstoday.com.my',
  'sinardaily.my',
  'therakyatpost.com',
  'edgeprop.my',
  'digitalnewsasia.com',
  'paultan.org',
  'lowyat.net',
  'soyacincau.com',
  'says.com',
  'asiaone.com',
  'marketing-interactive.com',
  'techinasia.com',
  'focusmalaysia.my',
  'thevibes.com',
  'dagangnews.com',
  'twentytwo13.my',
  'theasianbanker.com',
  'klsescreener.com',
  'i3investor.com',
  'investalks.com',
  'bursamalaysia.com',
  'stocknews.com',
  'marketscreener.com',
  'tradingview.com',
  'simplywall.st',
])

export const TIER_META = {
  1: { label: 'Tier 1', description: 'National dailies, wires and major business press' },
  2: { label: 'Tier 2', description: 'Trade, investor and niche business titles' },
  3: { label: 'Tier 3', description: 'Everything else — blogs, aggregators, unrecognised domains' },
}

export const getDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export const isSocialUrl = (url) => {
  const hostname = getDomain(url)
  return !!hostname && SOCIAL_DOMAINS.some(d => matchesDomain(hostname, d))
}

// Publication name for a URL — the map first, then a title-cased domain label.
export const getOutletName = (url) => {
  const hostname = getDomain(url)
  if (!hostname) return 'Unknown'
  const known = lookupBySuffix(hostname, Object.keys(DOMAIN_NAMES))
  if (known) return DOMAIN_NAMES[known]
  const base = hostname.split('.')[0]
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export const getOutletTier = (url) => {
  const hostname = getDomain(url)
  if (!hostname) return 3
  if (lookupBySuffix(hostname, [...TIER_1_DOMAINS])) return 1
  if (lookupBySuffix(hostname, [...TIER_2_DOMAINS])) return 2
  return 3
}

// How a mention is attributed in the Top Sources leaderboard.
//
// Published coverage is attributed to the *publication* (the domain), because
// a byline is not the thing a comms team pitches. Social posts are attributed
// to the *account*, because there the person is the source. Splitting them is
// why the leaderboard has two tabs rather than one mixed ranking.
// Handles some sources write when they know the network but not the account.
// Ranking these as accounts put "LinkedIn" at the top of the Voices list — a
// placeholder outranking every real person posting about us.
const PLACEHOLDER_HANDLES = new Set([
  '', 'unknown', 'instagram', 'facebook', 'linkedin', 'twitter', 'x',
  'youtube', 'threads', 'reddit', 'tiktok',
])

const isPlaceholderIdentity = (mention, handle, name) => {
  if (handle) return false
  if (!name) return true
  const n = name.toLowerCase()
  return n === 'unknown' || n === getOutletName(mention.url).toLowerCase()
}

export const getOutletRef = (mention) => {
  if (isSocialUrl(mention.url)) {
    const raw = (mention.author?.handle || '').toLowerCase()
    const handle = raw && !PLACEHOLDER_HANDLES.has(raw) ? mention.author.handle : null
    const name = mention.author?.name || handle || 'Unknown'

    // No usable identity — bucket per platform rather than inventing an author.
    if (isPlaceholderIdentity(mention, handle, mention.author?.name)) {
      const platform = mention.platform || getOutletName(mention.url)
      return {
        kind: 'voice',
        key: `voice:unattributed:${platform.toLowerCase()}`,
        label: `Unattributed · ${platform}`,
        handle: null,
        unattributed: true,
        tier: null,
        domain: getDomain(mention.url),
      }
    }

    return {
      kind: 'voice',
      // Handle is the stable identity; name can differ run to run.
      key: `voice:${(handle || name).toLowerCase()}`,
      label: name,
      handle,
      unattributed: false,
      tier: null,
      domain: getDomain(mention.url),
    }
  }
  const domain = getDomain(mention.url)
  return {
    kind: 'outlet',
    key: `outlet:${domain || 'unknown'}`,
    label: getOutletName(mention.url),
    handle: null,
    unattributed: false,
    tier: getOutletTier(mention.url),
    domain,
  }
}
