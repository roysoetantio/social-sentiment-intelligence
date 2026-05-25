import { Sparkles } from 'lucide-react'

export default function AICard({ label, children, aside }) {
  return (
    <div className="relative border border-[#2940BE]/50 bg-white rounded-lg px-3 py-2 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(207, 231, 255, 0.6) 3px, rgba(207, 231, 255, 0.6) 4px)`
      }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <Sparkles size={12} style={{ color: '#2940BE' }} />
            <span className="text-xs font-semibold" style={{ color: '#2940BE' }}>{label}</span>
          </div>
          {aside && <span className="text-xs text-muted">{aside}</span>}
        </div>
        {children}
      </div>
    </div>
  )
}
