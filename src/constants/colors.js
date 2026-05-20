export const BRAND_COLORS = {
  primary:  '#2940BE',
  teal:     '#19C9A5',
  orange:   '#E97132',
  sky:      '#1490EA',
  purple:   '#732BCC',
  darkText: '#313231',
}

export const SENTIMENT_COLORS = {
  positive: BRAND_COLORS.teal,
  negative: BRAND_COLORS.orange,
  neutral:  BRAND_COLORS.sky,
  mixed:    BRAND_COLORS.purple,
}

export const EMOTION_COLORS = {
  trust:        BRAND_COLORS.primary,
  satisfaction: BRAND_COLORS.teal,
  praise:       BRAND_COLORS.sky,
  frustration:  BRAND_COLORS.orange,
  anger:        '#ef4444',
  concern:      '#f59e0b',
}

export const STATUS_COLORS = {
  active:   BRAND_COLORS.teal,
  low:      '#f59e0b',
  inactive: '#ef4444',
}
