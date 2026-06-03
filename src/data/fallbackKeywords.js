export const KEYWORD_GROUPS = [
  {
    id: 'corporate',
    name: 'Corporate Brand',
    color: '#2940BE',
    keywords: [
      { id: 'uem-edgenta', term: 'UEM Edgenta', aliases: [], matchType: 'exact' },
    ]
  },
  {
    id: 'products',
    name: 'Products & Services',
    color: '#1490EA',
    keywords: [
      { id: 'edgenta-nxt', term: 'Edgenta NXT', aliases: [], matchType: 'exact' },
    ]
  },
  {
    id: 'executives',
    name: 'Executives',
    color: '#732BCC',
    keywords: [
      { id: 'shaiful-subhan', term: 'Shaiful Subhan', aliases: [], matchType: 'exact' },
      { id: 'chua-yong-howe', term: 'Chua Yong Howe', aliases: [], matchType: 'exact' },
    ]
  },
]

export const getAllKeywords = () => {
  return KEYWORD_GROUPS.flatMap(g => g.keywords.map(k => ({ ...k, groupId: g.id, groupName: g.name, groupColor: g.color })))
}

export const getKeywordById = (id) => getAllKeywords().find(k => k.id === id)
export const getGroupById = (id) => KEYWORD_GROUPS.find(g => g.id === id)
