import { BRAND_COLORS } from './colors'

export const SENTIMENT = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  NEUTRAL:  'neutral',
  MIXED:    'mixed',
}

export const SENTIMENT_OPTIONS = [
  { label: 'Positive', value: SENTIMENT.POSITIVE, color: BRAND_COLORS.teal,   bg: `${BRAND_COLORS.teal}15`,   border: `${BRAND_COLORS.teal}40`   },
  { label: 'Neutral',  value: SENTIMENT.NEUTRAL,  color: BRAND_COLORS.sky,    bg: `${BRAND_COLORS.sky}15`,    border: `${BRAND_COLORS.sky}40`    },
  { label: 'Negative', value: SENTIMENT.NEGATIVE, color: BRAND_COLORS.orange, bg: `${BRAND_COLORS.orange}15`, border: `${BRAND_COLORS.orange}40` },
]

// Shared predicate — used by Overview highRiskMentions AND mockAnalytics atRiskCount
export const isAtRisk = (m) => {
  // If user manually overrode sentiment away from negative, consider risk resolved
  const userOverrode = !!m.sentiment?.originalLabel
  if (userOverrode && m.sentiment?.label !== SENTIMENT.NEGATIVE) return false
  return (
    (m.riskFlag && m.sentiment?.label !== SENTIMENT.POSITIVE) ||
    (m.sentiment?.label === SENTIMENT.NEGATIVE && userOverrode)
  )
}

export const ANALYST_NAME = 'Roy Soetantio'
