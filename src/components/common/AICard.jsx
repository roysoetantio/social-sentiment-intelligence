import { Sparkles } from 'lucide-react'

export default function AICard({ label, children, aside }) {
  return (
    <div className="relative border border-[#2940BE]/50 dark:border-[#6B80FF]/40 bg-surface-card rounded-lg px-3 py-2 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `repeating-linear-gradient(135deg, transparent, transparent 3px, var(--ai-hatch) 3px, var(--ai-hatch) 4px)`
      }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <Sparkles size={12} className="text-[#2940BE] dark:text-[#6B80FF]" />
            <span className="text-xs font-semibold text-[#2940BE] dark:text-[#6B80FF]">{label}</span>
          </div>
          {aside && <span className="text-xs text-muted">{aside}</span>}
        </div>
        {children}
      </div>
    </div>
  )
}
