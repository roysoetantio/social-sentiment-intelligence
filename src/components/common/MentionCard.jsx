import React from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  Twitter, Youtube, Globe, Linkedin, MessageCircle,
  Heart, Share2, Eye, AlertTriangle, ExternalLink,
} from 'lucide-react'
import SentimentBadge from './SentimentBadge'
import RiskBadge from './RiskBadge'
import { KEYWORD_GROUPS } from '../../data/mockKeywords'
import { formatNum } from '../../utils/format'
import clsx from 'clsx'

const PlatformIcon = ({ platform }) => {
  const cls = 'shrink-0'
  switch (platform) {
    case 'Twitter': return <Twitter size={14} className={clsx(cls, 'text-sky-500')} />
    case 'YouTube': return <Youtube size={14} className={clsx(cls, 'text-red-500')} />
    case 'LinkedIn': return <Linkedin size={14} className={clsx(cls, 'text-blue-600')} />
    case 'Reddit': return <MessageCircle size={14} className={clsx(cls, 'text-orange-500')} />
    default: return <Globe size={14} className={clsx(cls, 'text-gray-400')} />
  }
}


export default function MentionCard({ mention, onClick, selected }) {
  const group = KEYWORD_GROUPS.find(g => g.id === mention.keywordGroup)

  return (
    <div
      onClick={() => onClick?.(mention)}
      className={clsx(
        'bg-white rounded-xl border cursor-pointer transition-all hover:shadow-md',
        selected ? 'border-primary shadow-sm ring-1 ring-primary/20' : 'border-gray-100 shadow-sm hover:border-gray-200'
      )}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <PlatformIcon platform={mention.platform} />
            <span className="text-xs font-medium text-gray-700 truncate">{mention.author.name}</span>
            <span className="text-xs text-gray-400 truncate">@{mention.author.handle}</span>
            {mention.author.verified && (
              <span className="text-[10px] bg-sky/10 text-sky px-1.5 py-0.5 rounded font-medium">✓</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {(mention.riskFlag || mention.sentiment?.label === 'negative') && (
              <AlertTriangle size={13} className={clsx(
                mention.riskLevel === 'high' ? 'text-red-500' :
                mention.sentiment?.label === 'negative' ? 'text-orange' : 'text-yellow-500'
              )} />
            )}
            <span className="text-[11px] text-gray-400">
              {formatDistanceToNow(parseISO(mention.publishedAt), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Text */}
        <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 mb-3">
          {mention.text}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SentimentBadge label={mention.sentiment.label} overridden={!!mention.sentiment.originalLabel} />
            {group && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border"
                style={{ color: group.color, borderColor: `${group.color}30`, backgroundColor: `${group.color}10` }}
              >
                {group.name}
              </span>
            )}
            {mention.mentionType === 'crisis' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 border border-red-200">
                Crisis
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            {mention.engagement.likes > 0 && (
              <span className="flex items-center gap-0.5">
                <Heart size={11} /> {formatNum(mention.engagement.likes)}
              </span>
            )}
            {mention.engagement.shares > 0 && (
              <span className="flex items-center gap-0.5">
                <Share2 size={11} /> {formatNum(mention.engagement.shares)}
              </span>
            )}
            <span className="flex items-center gap-0.5">
              <Eye size={11} /> {formatNum(mention.engagement.reach)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
