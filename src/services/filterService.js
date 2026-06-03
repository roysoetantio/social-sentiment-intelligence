import { isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns'

export const filterMentions = (mentions, filters, allKeywordsFlat = []) => {
  const {
    dateRange,
    selectedKeywords,
    selectedGroups,
    selectedPlatforms,
    selectedSentiments,
    selectedLanguages,
    searchQuery,
    selectedMentionTypes,
    selectedSources,
    riskOnly,
    showExcluded,
    heatmapFilter,
  } = filters

  // Build a map of keywordId -> groupId for fast lookup
  const kwGroupMap = new Map(allKeywordsFlat.map(k => [k.id, k.group_id]))

  return mentions.filter(mention => {
    // Excluded filter — hide excluded by default, show only when showExcluded is on
    if (showExcluded) {
      if (!mention.excluded) return false
    } else {
      if (mention.excluded) return false
    }
    // Date range filter
    if (dateRange && dateRange.start && dateRange.end) {
      const pubDate = parseISO(mention.publishedAt)
      if (!isWithinInterval(pubDate, {
        start: startOfDay(dateRange.start),
        end: endOfDay(dateRange.end),
      })) return false
    }

    // Keyword filter
    if (selectedKeywords && selectedKeywords.length > 0) {
      const hasKeyword = (mention.keywordMatched || []).some(k => selectedKeywords.includes(k))
      if (!hasKeyword) return false
    }

    // Group filter — check keywordGroup field OR any matched keyword's group
    if (selectedGroups && selectedGroups.length > 0) {
      const matchedGroups = (mention.keywordMatched || []).map(id => kwGroupMap.get(id)).filter(Boolean)
      const allGroups = [...new Set([mention.keywordGroup, ...matchedGroups])]
      if (!allGroups.some(g => selectedGroups.includes(g))) return false
    }

    // Platform filter
    if (selectedPlatforms && selectedPlatforms.length > 0) {
      if (!selectedPlatforms.includes(mention.platform)) return false
    }

    // Sentiment filter
    if (selectedSentiments && selectedSentiments.length > 0) {
      if (!selectedSentiments.includes(mention.sentiment.label)) return false
    }

    // Language filter
    if (selectedLanguages && selectedLanguages.length > 0) {
      if (!selectedLanguages.includes(mention.language)) return false
    }

    // Mention type filter
    if (selectedMentionTypes && selectedMentionTypes.length > 0) {
      if (!selectedMentionTypes.includes(mention.mentionType)) return false
    }

    // Source filter
    if (selectedSources && selectedSources.length > 0) {
      if (!selectedSources.includes(mention.source)) return false
    }

    // Heatmap filter (day of week + hour)
    if (heatmapFilter) {
      const pubDate = parseISO(mention.publishedAt)
      if (pubDate.getDay() !== heatmapFilter.day || pubDate.getHours() !== heatmapFilter.hour) return false
    }

    // Risk only filter
    if (riskOnly) {
      if (mention.riskLevel !== 'high') return false
    }

    // Search query
    if (searchQuery && searchQuery.trim().length > 0) {
      const query = searchQuery.toLowerCase()
      const textMatch = mention.text.toLowerCase().includes(query)
      const authorMatch = mention.author.name.toLowerCase().includes(query) ||
        mention.author.handle.toLowerCase().includes(query)
      const topicMatch = (mention.topics || []).some(t => t.toLowerCase().includes(query))
      if (!textMatch && !authorMatch && !topicMatch) return false
    }

    return true
  })
}

export const sortMentions = (mentions, sortBy = 'recent') => {
  const sorted = [...mentions]
  switch (sortBy) {
    case 'recent':
      return sorted.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt))
    case 'reach':
      return sorted.sort((a, b) => b.engagement.reach - a.engagement.reach)
    case 'engagement':
      return sorted.sort((a, b) => {
        const engA = a.engagement.likes + a.engagement.shares + a.engagement.comments
        const engB = b.engagement.likes + b.engagement.shares + b.engagement.comments
        return engB - engA
      })
    case 'risk':
      const riskOrder = { high: 0, medium: 1, low: 2, null: 3 }
      return sorted.sort((a, b) => (riskOrder[a.riskLevel] ?? 3) - (riskOrder[b.riskLevel] ?? 3))
    case 'sentiment-pos':
      return sorted.sort((a, b) => b.sentiment.score - a.sentiment.score)
    case 'sentiment-neg':
      return sorted.sort((a, b) => a.sentiment.score - b.sentiment.score)
    default:
      return sorted
  }
}
