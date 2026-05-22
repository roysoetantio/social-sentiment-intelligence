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
    default: return <Globe size={14} className={clsx(cls, 'text-muted')} />
  }
}


export default function MentionCard({ mention, onClick, selected }) {
  const group = KEYWORD_GROUPS.find(g => g.id === mention.keywordGroup)

  return (
    <div
      onClick={() => onClick?.(mention)}
      className={clsx(
        'bg-canvas dark:bg-surface-dark-elevated rounded-lg border cursor-pointer transition-all',
        selected
          ? 'border-[#2940BE] shadow-card ring-1 ring-[#2940BE]/20'
          : 'border-hairline-strong dark:border-white/8 hover:shadow-card hover:border-ink/20'
      )}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <PlatformIcon platform={mention.platform} />
            <span className="text-sm font-semibold text-ink dark:text-on-dark truncate">{mention.author.name}</span>
            <span className="text-[0.8125rem] text-muted truncate">@{mention.author.handle}</span>
            {mention.author.verified && (
              <span className="text-[0.625rem] bg-sky/10 text-sky px-1.5 py-0.5 rounded font-medium">✓</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {(mention.riskFlag || mention.sentiment?.label === 'negative') && (
              <AlertTriangle size={13} className={clsx(
                mention.riskLevel === 'high' ? 'text-error' :
                mention.sentiment?.label === 'negative' ? 'text-orange' : 'text-warning'
              )} />
            )}
            <span className="text-[0.8125rem] text-muted">
              {formatDistanceToNow(parseISO(mention.publishedAt), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Text */}
        <p className="text-sm text-body dark:text-on-dark-soft leading-relaxed line-clamp-2 mb-3">
          {mention.text}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SentimentBadge label={mention.sentiment.label} overridden={!!mention.sentiment.originalLabel} />
            {group && (
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[0.6875rem] font-normal border border-hairline-strong dark:border-white/8 bg-surface-strong dark:bg-white/8 text-muted dark:text-on-dark-soft"
              >
                {group.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[0.8125rem] text-muted">
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
