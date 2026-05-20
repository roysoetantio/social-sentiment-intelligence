import Sentiment from 'sentiment'

const analyzer = new Sentiment()

export const analyzeSentiment = (text) => {
  try {
    const result = analyzer.analyze(text)
    const score = result.score
    const comparative = result.comparative

    let label = 'neutral'
    let normalizedScore = 0

    if (comparative > 0.5) {
      label = 'positive'
      normalizedScore = Math.min(comparative / 3, 1)
    } else if (comparative < -0.5) {
      label = 'negative'
      normalizedScore = Math.max(comparative / 3, -1)
    } else if (comparative > 0.1) {
      label = 'positive'
      normalizedScore = comparative / 3
    } else if (comparative < -0.1) {
      label = 'negative'
      normalizedScore = comparative / 3
    } else {
      label = 'neutral'
      normalizedScore = comparative / 3
    }

    if (result.positive.length > 0 && result.negative.length > 0) {
      label = 'mixed'
    }

    const confidence = Math.min(0.5 + Math.abs(comparative) * 0.2, 0.95)

    return {
      label,
      score: parseFloat(normalizedScore.toFixed(3)),
      confidence: parseFloat(confidence.toFixed(2)),
      raw: result,
    }
  } catch {
    return {
      label: 'neutral',
      score: 0,
      confidence: 0.5,
      raw: null,
    }
  }
}

export const getSentimentColor = (label) => {
  switch (label) {
    case 'positive': return '#19C9A5'
    case 'negative': return '#E97132'
    case 'neutral': return '#1490EA'
    case 'mixed': return '#732BCC'
    default: return '#9ca3af'
  }
}

export const getSentimentBgColor = (label) => {
  switch (label) {
    case 'positive': return 'rgba(25, 201, 165, 0.1)'
    case 'negative': return 'rgba(233, 113, 50, 0.1)'
    case 'neutral': return 'rgba(20, 144, 234, 0.1)'
    case 'mixed': return 'rgba(115, 43, 204, 0.1)'
    default: return 'rgba(156, 163, 175, 0.1)'
  }
}

export const formatSentimentScore = (score) => {
  const pct = (score * 100).toFixed(0)
  return score >= 0 ? `+${pct}` : `${pct}`
}
