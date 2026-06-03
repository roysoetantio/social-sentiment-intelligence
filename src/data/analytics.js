import { subDays, format, startOfDay, startOfWeek, startOfMonth, startOfHour } from 'date-fns'
import { isAtRisk } from '../constants/sentiment'

const now = new Date('2026-05-18T12:00:00')

const bucketMentions = (mentions, bucketKey) => {
  const buckets = {}
  mentions.forEach(m => {
    const d = new Date(m.publishedAt)
    const key = bucketKey(d)
    if (!buckets[key]) buckets[key] = []
    buckets[key].push(m)
  })
  return buckets
}

const tally = (arr) => ({
  total: arr.length,
  positive: arr.filter(m => m.sentiment.label === 'positive').length,
  negative: arr.filter(m => m.sentiment.label === 'negative').length,
  neutral:  arr.filter(m => m.sentiment.label === 'neutral').length,
  mixed:    arr.filter(m => m.sentiment.label === 'mixed').length,
})

// granularity: 'hour' | 'day' | 'week' | 'month'
export const getTimelineData = (mentions, days = 30, granularity = 'day') => {
  const end = new Date()
  const start = subDays(end, days)
  const inRange = mentions.filter(m => {
    const d = new Date(m.publishedAt)
    return d >= start && d <= end
  })

  if (granularity === 'hour') {
    const todayStart = startOfDay(end)
    const buckets = bucketMentions(inRange, d => format(startOfHour(d), 'yyyy-MM-dd HH'))
    const result = []
    for (let h = 0; h < 24; h++) {
      const slot = new Date(todayStart.getTime() + h * 60 * 60 * 1000)
      const key = format(slot, 'yyyy-MM-dd HH')
      result.push({ date: key, displayDate: format(slot, 'ha'), ...tally(buckets[key] || []) })
    }
    return result
  }

  if (granularity === 'month') {
    const buckets = bucketMentions(inRange, d => format(startOfMonth(d), 'yyyy-MM'))
    // Build month slots from start to end
    const result = []
    let cursor = startOfMonth(start)
    while (cursor <= end) {
      const key = format(cursor, 'yyyy-MM')
      result.push({ date: key, displayDate: format(cursor, 'MMM yyyy'), ...tally(buckets[key] || []) })
      cursor = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
    }
    return result
  }

  if (granularity === 'week') {
    const buckets = bucketMentions(inRange, d => format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
    const result = []
    let cursor = startOfWeek(start, { weekStartsOn: 1 })
    while (cursor <= end) {
      const key = format(cursor, 'yyyy-MM-dd')
      result.push({ date: key, displayDate: format(cursor, 'MMM d'), ...tally(buckets[key] || []) })
      cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000)
    }
    return result
  }

  // day
  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(end, i)
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayMentions = inRange.filter(m => format(new Date(m.publishedAt), 'yyyy-MM-dd') === dateStr)
    result.push({ date: dateStr, displayDate: format(date, 'MMM d'), ...tally(dayMentions) })
  }
  return result
}

export const getPlatformBreakdown = (mentions) => {
  const platforms = {}
  mentions.forEach(m => {
    if (!platforms[m.platform]) platforms[m.platform] = { name: m.platform, total: 0, positive: 0, negative: 0, neutral: 0, mixed: 0 }
    platforms[m.platform].total++
    platforms[m.platform][m.sentiment.label]++
  })
  return Object.values(platforms).sort((a, b) => b.total - a.total)
}

export const getKeywordGroupStats = (mentions) => {
  const groups = {}
  mentions.forEach(m => {
    if (!groups[m.keywordGroup]) {
      groups[m.keywordGroup] = { id: m.keywordGroup, total: 0, positive: 0, negative: 0, neutral: 0, mixed: 0, reach: 0, engagement: 0 }
    }
    groups[m.keywordGroup].total++
    groups[m.keywordGroup][m.sentiment.label]++
    groups[m.keywordGroup].reach += m.engagement.reach
    groups[m.keywordGroup].engagement += m.engagement.likes + m.engagement.shares + m.engagement.comments
  })
  return groups
}

export const getHeatmapData = (mentions) => {
  const grid = {}
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      grid[`${day}-${hour}`] = { day, hour, total: 0, negative: 0 }
    }
  }
  mentions.forEach(m => {
    const d = new Date(m.publishedAt)
    const day = d.getDay()
    const hour = d.getHours()
    const key = `${day}-${hour}`
    grid[key].total++
    if (m.sentiment.label === 'negative') grid[key].negative++
  })
  return Object.values(grid)
}

export const getKPIs = (mentions) => {
  const total = mentions.length
  const positive = mentions.filter(m => m.sentiment.label === 'positive').length
  const negative = mentions.filter(m => m.sentiment.label === 'negative').length
  const neutral = mentions.filter(m => m.sentiment.label === 'neutral').length
  const mixed = mentions.filter(m => m.sentiment.label === 'mixed').length
  const atRisk = mentions.filter(isAtRisk).length
  const netScore = total > 0 ? parseFloat(((positive - negative) / total * 100).toFixed(1)) : 0
  const avgScore = total > 0 ? parseFloat((mentions.reduce((s, m) => s + m.sentiment.score, 0) / total).toFixed(3)) : 0

  const keywordCounts = {}
  mentions.forEach(m => {
    (m.keywordMatched || []).forEach(k => {
      keywordCounts[k] = (keywordCounts[k] || 0) + 1
    })
  })
  const topKeyword = Object.entries(keywordCounts).sort((a, b) => b[1] - a[1])[0]

  const totalReach = mentions.reduce((s, m) => s + m.engagement.reach, 0)
  const totalEngagement = mentions.reduce((s, m) => s + m.engagement.likes + m.engagement.shares + m.engagement.comments, 0)

  return {
    totalMentions: total,
    positiveCount: positive,
    negativeCount: negative,
    neutralCount: neutral,
    mixedCount: mixed,
    positivePercent: total > 0 ? parseFloat((positive / total * 100).toFixed(1)) : 0,
    negativePercent: total > 0 ? parseFloat((negative / total * 100).toFixed(1)) : 0,
    neutralPercent: total > 0 ? parseFloat((neutral / total * 100).toFixed(1)) : 0,
    netSentimentScore: netScore,
    avgSentimentScore: avgScore,
    atRiskCount: atRisk,
    topKeyword: topKeyword ? topKeyword[0] : null,
    topKeywordCount: topKeyword ? topKeyword[1] : 0,
    totalReach,
    totalEngagement,
  }
}

export const getShareOfVoice = (mentions) => {
  const brands = {
    'UEM Edgenta': { count: 0, color: '#2940BE' },
    'Gamuda': { count: 0, color: '#E97132' },
    'ISS Malaysia': { count: 0, color: '#732BCC' },
    'Serba Dinamik': { count: 0, color: '#1490EA' },
  }
  mentions.forEach(m => {
    if (!m.isCompetitor && (m.keywordGroup === 'corporate' || m.keywordGroup === 'products' || m.keywordGroup === 'executives' || m.keywordGroup === 'campaigns')) {
      brands['UEM Edgenta'].count++
    } else if (m.keywordMatched.includes('comp-gamuda')) {
      brands['Gamuda'].count++
    } else if (m.keywordMatched.includes('comp-iss')) {
      brands['ISS Malaysia'].count++
    } else if (m.keywordMatched.includes('comp-serba')) {
      brands['Serba Dinamik'].count++
    }
  })
  const total = Object.values(brands).reduce((s, b) => s + b.count, 0)
  return Object.entries(brands).map(([name, data]) => ({
    name,
    count: data.count,
    percent: total > 0 ? parseFloat((data.count / total * 100).toFixed(1)) : 0,
    color: data.color,
  }))
}

export const getTopEmotions = (mentions) => {
  const emotionCounts = {}
  mentions.forEach(m => {
    (m.emotions || []).forEach(e => {
      emotionCounts[e] = (emotionCounts[e] || 0) + 1
    })
  })
  return Object.entries(emotionCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

export const getKeywordComparisonData = (mentions, allKeywords = []) => {
  const keywordMap = {}
  mentions.forEach(m => {
    (m.keywordMatched || []).forEach(kId => {
      if (!keywordMap[kId]) {
        const kw = allKeywords.find(k => k.id === kId)
        keywordMap[kId] = { id: kId, term: kw?.term || kId, total: 0, positive: 0, negative: 0, neutral: 0, engagement: 0, reach: 0 }
      }
      keywordMap[kId].total++
      keywordMap[kId][m.sentiment.label]++
      keywordMap[kId].engagement += m.engagement.likes + m.engagement.shares + m.engagement.comments
      keywordMap[kId].reach += m.engagement.reach
    })
  })

  const maxTotal = Math.max(...Object.values(keywordMap).map(k => k.total), 1)
  const maxEngagement = Math.max(...Object.values(keywordMap).map(k => k.engagement), 1)
  const maxReach = Math.max(...Object.values(keywordMap).map(k => k.reach), 1)

  return Object.values(keywordMap).filter(k => k.term !== k.id).map(k => ({
    ...k,
    positiveRate: k.total > 0 ? parseFloat((k.positive / k.total * 100).toFixed(1)) : 0,
    negativeRate: k.total > 0 ? parseFloat((k.negative / k.total * 100).toFixed(1)) : 0,
    volumeScore: parseFloat((k.total / maxTotal * 100).toFixed(1)),
    engagementScore: parseFloat((k.engagement / maxEngagement * 100).toFixed(1)),
    reachScore: parseFloat((k.reach / maxReach * 100).toFixed(1)),
  }))
}
