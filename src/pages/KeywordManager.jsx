import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Edit2, Trash2, Tag,
  CheckCircle, AlertCircle, XCircle, Activity, Save, X, RefreshCw, Loader, FolderInput,
  Settings, Pause, Play, Download, Terminal,
} from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { getKeywordGroupStats } from '../data/mockAnalytics'
import { supabase } from '../lib/supabase'
import { BRAND_COLORS, SENTIMENT_COLORS, STATUS_COLORS } from '../constants/colors'
import clsx from 'clsx'

const getHealthStatus = (total, positive, negative) => {
  if (total === 0) return { level: 'inactive', color: STATUS_COLORS.inactive, label: 'No mentions', icon: XCircle }
  if (total < 3) return { level: 'low', color: STATUS_COLORS.low, label: 'Low activity', icon: AlertCircle }
  return { level: 'active', color: STATUS_COLORS.active, label: 'Active', icon: CheckCircle }
}

function KeywordMiniBar({ positive, negative, neutral, total }) {
  if (!total) return <div className="text-xs text-muted">No data</div>
  const posPct = Math.round(positive / total * 100)
  const negPct = Math.round(negative / total * 100)
  const neuPct = 100 - posPct - negPct
  return (
    <div className="space-y-1">
      <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
        <div style={{ width: `${posPct}%`, backgroundColor: SENTIMENT_COLORS.positive }} />
        <div style={{ width: `${neuPct}%`, backgroundColor: SENTIMENT_COLORS.neutral }} />
        <div style={{ width: `${negPct}%`, backgroundColor: SENTIMENT_COLORS.negative }} />
      </div>
      <div className="flex gap-2 text-[10px] text-muted">
        <span className="text-teal">{posPct}%+</span>
        <span className="text-orange">{negPct}%-</span>
        <span className="text-muted">{total} total</span>
      </div>
    </div>
  )
}

function useIngest({ onDone } = {}) {
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const [fetchingIds, setFetchingIds] = useState([])

  const run = useCallback(async (keywordIds = []) => {
    setRunning(true)
    setLogs([])
    setFetchingIds(keywordIds)

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordIds }),
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim()
          if (!line) continue
          try {
            const msg = JSON.parse(line)
            if (msg.log) setLogs(l => [...l, { text: msg.log, error: msg.error }])
            if (msg.done) { onDone?.(); }
          } catch {}
        }
      }
    } catch (e) {
      setLogs(l => [...l, { text: `Error: ${e.message}`, error: true }])
    }

    setRunning(false)
    setFetchingIds([])
  }, [onDone])

  return { running, logs, fetchingIds, run }
}

function IngestLogPanel({ logs, onClose }) {
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Terminal size={13} className="text-teal" />
          <span className="text-xs font-semibold text-white">Ingest Log</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-700 transition-colors">
          <X size={13} className="text-muted" />
        </button>
      </div>
      <div className="h-48 overflow-y-auto px-4 py-3 space-y-0.5 font-mono text-[11px]">
        {logs.length === 0 && <p className="text-body">Starting...</p>}
        {logs.map((l, i) => (
          <p key={i} className={l.error ? 'text-red-400' : 'text-gray-300'}>{l.text}</p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function GroupNameEditor({ group, onSave, onCancel }) {
  const [name, setName] = useState(group.name)
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(name); if (e.key === 'Escape') onCancel() }}
        className="flex-1 text-xs border border-ink dark:border-white/20 rounded px-2 py-1 focus:outline-none min-w-0 bg-canvas dark:bg-[#171717] text-ink dark:text-on-dark"
      />
      <button onClick={() => onSave(name)} className="p-1 rounded hover:bg-surface-strong dark:hover:bg-white/8"><Save size={11} className="text-ink dark:text-on-dark" /></button>
      <button onClick={onCancel} className="p-1 rounded hover:bg-surface-strong dark:hover:bg-white/8"><X size={11} className="text-muted dark:text-on-dark-soft" /></button>
    </div>
  )
}

function DeleteKeywordModal({ keyword, mentionCount, onConfirm, onCancel, saving }) {
  const [choice, setChoice] = useState(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-surface-dark-elevated rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-transparent dark:border-white/8">
        <div className="p-5 border-b border-hairline dark:border-white/8">
          <h3 className="text-sm font-semibold text-ink dark:text-on-dark">Delete "{keyword.term}"</h3>
          <p className="text-xs text-muted dark:text-on-dark-soft mt-0.5">
            This keyword has <span className="font-semibold text-body dark:text-on-dark-soft">{mentionCount} mention{mentionCount !== 1 ? 's' : ''}</span> in the database. What should happen to them?
          </p>
        </div>

        <div className="p-5 space-y-3">
          <button
            onClick={() => setChoice('hide')}
            className={clsx(
              'w-full text-left rounded-xl border-2 p-4 transition-all',
              choice === 'hide' ? 'border-ink dark:border-white/30 bg-surface-strong dark:bg-white/8' : 'border-hairline dark:border-white/8 hover:border-hairline-strong dark:hover:border-white/20'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={clsx('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0', choice === 'hide' ? 'border-ink dark:border-white/50' : 'border-gray-300 dark:border-white/20')}>
                {choice === 'hide' && <div className="w-2 h-2 rounded-full bg-ink dark:bg-on-dark" />}
              </div>
              <div>
                <p className="text-xs font-semibold text-ink dark:text-on-dark">Keep &amp; Hide</p>
                <p className="text-xs text-muted dark:text-on-dark-soft mt-0.5">Mentions stay in Supabase but are hidden from all views and charts. Reversible.</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setChoice('delete')}
            className={clsx(
              'w-full text-left rounded-xl border-2 p-4 transition-all',
              choice === 'delete' ? 'border-red-400 bg-red-50 dark:bg-red-950/30' : 'border-hairline dark:border-white/8 hover:border-hairline-strong dark:hover:border-white/20'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={clsx('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0', choice === 'delete' ? 'border-red-400' : 'border-gray-300 dark:border-white/20')}>
                {choice === 'delete' && <div className="w-2 h-2 rounded-full bg-red-400" />}
              </div>
              <div>
                <p className="text-xs font-semibold text-red-600">Delete permanently</p>
                <p className="text-xs text-muted dark:text-on-dark-soft mt-0.5">Removes all {mentionCount} mention{mentionCount !== 1 ? 's' : ''} from Supabase. This cannot be undone.</p>
              </div>
            </div>
          </button>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-xs font-medium text-body dark:text-on-dark-soft border border-hairline-strong dark:border-white/8 rounded-lg hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(choice)}
            disabled={!choice || saving}
            className={clsx(
              'flex-1 py-2 text-xs font-medium text-on-dark rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed',
              choice === 'delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-ink hover:bg-primary-active'
            )}
          >
            {saving && <Loader size={12} className="animate-spin" />}
            {choice === 'delete' ? 'Remove Keyword & Delete Mentions' : choice === 'hide' ? 'Remove Keyword & Hide Mentions' : 'Select an option above'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GearPopover({ keyword, onDelete, onClose }) {
  const ref = useRef(null)
  const [paused, setPaused] = useState(keyword.syncPaused || false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handlePauseToggle = async () => {
    setToggling(true)
    const { error } = await supabase.from('keywords').update({ sync_paused: !paused }).eq('id', keyword.id)
    if (!error) setPaused(p => !p)
    setToggling(false)
  }

  return (
    <div ref={ref} className="absolute right-0 top-8 z-40 bg-white dark:bg-surface-dark-elevated border border-hairline-strong dark:border-white/8 rounded-xl shadow-xl w-52 overflow-hidden">
      <div className="p-1">
        <button
          onClick={handlePauseToggle}
          disabled={toggling}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
        >
          <div className="flex items-center gap-2">
            {paused ? <Play size={13} className="text-teal" /> : <Pause size={13} className="text-muted" />}
            <span className="text-xs text-ink dark:text-on-dark font-medium">{paused ? 'Resume syncing' : 'Pause syncing'}</span>
          </div>
          <div className={clsx('w-8 h-4 rounded-full transition-colors relative', paused ? 'bg-orange' : 'bg-gray-200')}>
            <div className={clsx('absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all', paused ? 'left-4' : 'left-0.5')} />
          </div>
        </button>

        <div className="border-t border-hairline dark:border-white/8 my-1" />

        <button
          onClick={() => { onClose(); onDelete() }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-red-50 transition-colors"
        >
          <Trash2 size={13} className="text-red-400" />
          <span className="text-xs text-red-500 font-medium">Delete keyword…</span>
        </button>
      </div>
    </div>
  )
}

function KeywordForm({ keyword, groupColor, onSave, onCancel, saving }) {
  const [term, setTerm] = useState(keyword?.term || '')

  const handleSave = () => {
    if (!term.trim()) return
    onSave({
      id: keyword?.id || `kw-${Date.now()}`,
      term: term.trim(),
    })
  }

  return (
    <div className="border border-hairline-strong dark:border-white/8 rounded-lg p-3 bg-surface-strong dark:bg-white/8 space-y-2.5">
      <div>
        <label className="section-label">Keyword</label>
        <input
          type="text"
          value={term}
          onChange={e => setTerm(e.target.value)}
          className="form-input mt-1"
          placeholder="Enter keyword..."
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs font-medium text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
          style={{ backgroundColor: groupColor }}
        >
          {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={onCancel} className="flex items-center gap-1.5 text-xs font-medium text-body dark:text-on-dark-soft px-3 py-1.5 rounded-lg border border-hairline-strong dark:border-white/8 hover:bg-surface-strong dark:hover:bg-white/8 transition-colors">
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  )
}

export default function KeywordManager() {
  const { filteredMentions, updateMentionGroups, reloadMentions } = useDashboard()
  const { running, logs, fetchingIds, run: runIngest } = useIngest({ onDone: reloadMentions })
  const [showLog, setShowLog] = useState(false)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [editingKeyword, setEditingKeyword] = useState(null)
  const [addingToGroup, setAddingToGroup] = useState(null)
  const [movingKeyword, setMovingKeyword] = useState(null)
  const [gearOpen, setGearOpen] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)
  const [editingGroup, setEditingGroup] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Load from Supabase
  const loadKeywords = useCallback(async () => {
    setLoading(true)
    const [{ data: groupData }, { data: kwData }] = await Promise.all([
      supabase.from('keyword_groups').select('*').order('created_at'),
      supabase.from('keywords').select('*').eq('is_active', true).order('created_at'),
    ])

    if (groupData) {
      const merged = groupData.map(g => ({
        id: g.id,
        name: g.name,
        color: g.color,
        keywords: (kwData || [])
          .filter(k => k.group_id === g.id)
          .map(k => ({
            id: k.id,
            term: k.term,
            aliases: k.aliases || [],
            matchType: k.match_type,
            syncPaused: k.sync_paused || false,
          })),
      }))
      setGroups(merged)
      if (!selectedGroup) setSelectedGroup(merged[0])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadKeywords() }, [loadKeywords])

  const groupStats = useMemo(() => getKeywordGroupStats(filteredMentions), [filteredMentions])

  const getKeywordStats = (kwId) => {
    const mentions = filteredMentions.filter(m => m.keywordMatched.includes(kwId))
    return {
      total: mentions.length,
      positive: mentions.filter(m => m.sentiment.label === 'positive').length,
      negative: mentions.filter(m => m.sentiment.label === 'negative').length,
      neutral: mentions.filter(m => m.sentiment.label === 'neutral').length,
    }
  }


  const handleSaveKeyword = async (groupId, kwData) => {
    setSaving(true)
    const isNew = !kwData.id || kwData.id.startsWith('kw-')
    const payload = {
      id: isNew ? crypto.randomUUID() : kwData.id,
      group_id: groupId,
      term: kwData.term,
      aliases: [],
      match_type: 'exact',
      is_active: true,
    }

    const { error } = await supabase.from('keywords').upsert(payload, { onConflict: 'id' })

    if (error) {
      console.error('[KeywordManager] save error:', error)
      showToast(`Failed: ${error.message}`, 'error')
    } else {
      showToast(`"${kwData.term}" saved`)
      await loadKeywords()
    }
    setSaving(false)
    setEditingKeyword(null)
    setAddingToGroup(null)
  }

  const handleMoveKeyword = async (kwId, kwTerm, targetGroupId) => {
    const targetGroup = groups.find(g => g.id === targetGroupId)
    const [{ error: kwError }, { error: mentionError }] = await Promise.all([
      supabase.from('keywords').update({ group_id: targetGroupId }).eq('id', kwId),
      supabase.from('mentions').update({ keyword_group: targetGroupId }).contains('keyword_matched', [kwId]),
    ])
    if (kwError || mentionError) {
      showToast('Failed to move keyword', 'error')
    } else {
      updateMentionGroups(kwId, targetGroupId)
      showToast(`"${kwTerm}" moved to ${targetGroup?.name}`)
      await loadKeywords()
    }
  }

  const handleDeleteKeyword = async (choice) => {
    if (!deleteModal) return
    const { kwId, kwTerm } = deleteModal
    setSaving(true)
    const res = await fetch('/api/delete-mentions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kwId, action: choice }),
    })
    const { ok, error } = await res.json()
    if (!ok) {
      showToast(`Failed: ${error}`, 'error')
    } else {
      showToast(`"${kwTerm}" ${choice === 'hide' ? 'removed & mentions hidden' : 'deleted'}`)
      await loadKeywords()
      await new Promise(r => setTimeout(r, 500))
      await reloadMentions()
    }
    setSaving(false)
    setDeleteModal(null)
  }

  const handleRenameGroup = async (groupId, newName) => {
    if (!newName.trim()) return
    const { error } = await supabase.from('keyword_groups').update({ name: newName.trim() }).eq('id', groupId)
    if (error) {
      showToast('Failed to rename group', 'error')
    } else {
      showToast(`Group renamed to "${newName.trim()}"`)
      await loadKeywords()
    }
    setEditingGroup(null)
  }

  const handleDeleteGroup = async (groupId, groupName) => {
    const { error } = await supabase.from('keyword_groups').delete().eq('id', groupId)
    if (error) {
      showToast('Failed to delete group', 'error')
    } else {
      showToast(`Group "${groupName}" deleted`)
      setSelectedGroup(null)
      await loadKeywords()
    }
  }

  const handleAddGroup = async () => {
    const name = prompt('Group name:')
    if (!name?.trim()) return
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const colors = ['#2940BE', '#1490EA', '#732BCC', '#E97132', '#19C9A5', '#F59E0B', '#EF4444']
    const color = colors[groups.length % colors.length]
    const { error } = await supabase.from('keyword_groups').insert({ id, name: name.trim(), color })
    if (error) {
      showToast('Failed to create group', 'error')
    } else {
      showToast(`Group "${name}" created`)
      await loadKeywords()
    }
  }

  const selectedGroupData = groups.find(g => g.id === selectedGroup?.id) || groups[0]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader size={24} className="animate-spin text-ink" />
        <span className="ml-2 text-sm text-body">Loading keywords...</span>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)] relative">
      {(showLog || running) && (
        <IngestLogPanel logs={logs} onClose={() => setShowLog(false)} />
      )}
      {deleteModal && (
        <DeleteKeywordModal
          keyword={{ id: deleteModal.kwId, term: deleteModal.kwTerm }}
          mentionCount={deleteModal.mentionCount}
          saving={saving}
          onConfirm={handleDeleteKeyword}
          onCancel={() => setDeleteModal(null)}
        />
      )}
      {/* Toast */}
      {toast && (
        <div className={clsx(
          'fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg text-white transition-all',
          toast.type === 'error' ? 'bg-red-500' : 'bg-teal'
        )}>
          {toast.type === 'success' ? <CheckCircle size={14} className="inline mr-2" /> : <XCircle size={14} className="inline mr-2" />}
          {toast.msg}
        </div>
      )}

      {/* Left: Group list */}
      <div className="w-64 flex-shrink-0 overflow-y-auto">
        <div className="card space-y-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-ink dark:text-on-dark">Keyword Groups</h3>
            <div className="flex items-center gap-1">
              {false && <button
                onClick={() => { setShowLog(true); runIngest() }}
                disabled={running}
                className="flex items-center gap-1 text-[10px] text-ink dark:text-on-dark font-medium px-2 py-1 rounded-md hover:bg-surface-strong dark:hover:bg-white/8 transition-colors disabled:opacity-40"
                title="Fetch all keywords"
              >
                {running && fetchingIds.length === 0 ? <Loader size={11} className="animate-spin" /> : <Download size={11} />}
                Fetch All
              </button>}
              <button onClick={loadKeywords} className="p-1 rounded hover:bg-surface-strong transition-colors" title="Refresh">
                <RefreshCw size={12} className="text-muted" />
              </button>
            </div>
          </div>

          {groups.map(g => {
            const isSelected = selectedGroupData?.id === g.id
            const isEmpty = g.keywords.length === 0

            return (
              <button
                key={g.id}
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all',
                  isSelected ? 'bg-surface-strong dark:bg-white/8 border-ink dark:border-white/20 shadow-sm' : 'border-hairline dark:border-white/8 hover:border-hairline-strong dark:hover:border-white/20 hover:bg-surface-strong dark:hover:bg-white/8'
                )}
                onClick={() => setSelectedGroup(g)}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                  <span className={clsx('text-xs font-semibold truncate text-ink dark:text-on-dark')}>{g.name}</span>
                </span>
                <span className="text-[10px] text-muted dark:text-on-dark-soft flex-shrink-0">({g.keywords.length})</span>
              </button>
            )
          })}

          <button
            onClick={handleAddGroup}
            className="flex items-center justify-center gap-1.5 w-full text-xs text-ink dark:text-on-dark hover:bg-surface-strong dark:hover:bg-white/8 px-2 py-2 rounded-md border border-dashed border-hairline-strong dark:border-white/8 transition-colors mt-1"
          >
            <Plus size={13} /> New Group
          </button>
        </div>
      </div>

      {/* Right: Group detail */}
      <div className="flex-1 overflow-y-auto">
        {selectedGroupData && (
          <div className="space-y-4">
            {/* Group header */}
            <div className="card">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${selectedGroupData.color}15` }}>
                    <Tag size={18} style={{ color: selectedGroupData.color }} />
                  </div>
                  <div>
                    {editingGroup === selectedGroupData.id ? (
                      <GroupNameEditor
                        group={selectedGroupData}
                        onSave={(name) => handleRenameGroup(selectedGroupData.id, name)}
                        onCancel={() => setEditingGroup(null)}
                      />
                    ) : (
                      <h2 className="text-base font-semibold text-ink dark:text-on-dark">{selectedGroupData.name}</h2>
                    )}
                    <p className="text-xs text-muted dark:text-on-dark-soft">{selectedGroupData.keywords.length} keywords tracked</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingGroup(editingGroup === selectedGroupData.id ? null : selectedGroupData.id)}
                    className="p-1.5 rounded-lg hover:bg-surface-strong transition-colors"
                    title="Rename group"
                  >
                    <Edit2 size={13} className="text-muted" />
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(selectedGroupData.id, selectedGroupData.name)}
                    disabled={selectedGroupData.keywords.length > 0}
                    className={clsx('p-1.5 rounded-lg transition-colors', selectedGroupData.keywords.length === 0 ? 'hover:bg-red-50' : 'cursor-not-allowed opacity-30')}
                    title={selectedGroupData.keywords.length === 0 ? 'Delete group' : 'Remove all keywords first'}
                  >
                    <Trash2 size={13} className={selectedGroupData.keywords.length === 0 ? 'text-red-400' : 'text-gray-300'} />
                  </button>
                </div>
              </div>

              {/* Group stats */}
              <div className="grid grid-cols-4 gap-3">
                {(() => {
                  const s = groupStats[selectedGroupData.id] || { total: 0, positive: 0, negative: 0, neutral: 0 }
                  return [
                    { label: 'Total', value: s.total, color: BRAND_COLORS.primary },
                    { label: 'Positive', value: s.positive, color: SENTIMENT_COLORS.positive },
                    { label: 'Negative', value: s.negative, color: SENTIMENT_COLORS.negative },
                    { label: 'Neutral', value: s.neutral, color: SENTIMENT_COLORS.neutral },
                  ].map(stat => (
                    <div key={stat.label} className="bg-surface-strong dark:bg-[#171717] rounded-lg p-3 text-center border border-transparent dark:border-white/8">
                      <div className="kpi-number text-xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                      <div className="text-[10px] text-body dark:text-on-dark-soft mt-0.5">{stat.label}</div>
                    </div>
                  ))
                })()}
              </div>
            </div>

            {/* Keywords */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink dark:text-on-dark">Keywords</h3>
                <div className="flex items-center gap-2">
                  {false && <button
                    onClick={() => { setShowLog(true); runIngest(selectedGroupData.keywords.map(k => k.id)) }}
                    disabled={running || selectedGroupData.keywords.length === 0}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-hairline-strong dark:border-white/8 text-body dark:text-on-dark-soft hover:bg-surface-strong dark:hover:bg-white/8 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {running && fetchingIds.length > 0 && fetchingIds.every(id => selectedGroupData.keywords.map(k=>k.id).includes(id))
                      ? <Loader size={12} className="animate-spin" />
                      : <Download size={12} />}
                    Fetch Group
                  </button>}
                  <button
                    onClick={() => setAddingToGroup(selectedGroupData.id)}
                    className="flex items-center gap-1.5 text-xs text-white px-3 py-1.5 rounded-lg transition-colors"
                    style={{ backgroundColor: selectedGroupData.color }}
                  >
                    <Plus size={13} /> Add Keyword
                  </button>
                </div>
              </div>

              {addingToGroup === selectedGroupData.id && (
                <div className="mb-4">
                  <KeywordForm
                    groupColor={selectedGroupData.color}
                    saving={saving}
                    onSave={(kw) => handleSaveKeyword(selectedGroupData.id, kw)}
                    onCancel={() => setAddingToGroup(null)}
                  />
                </div>
              )}

              <div className="space-y-3">
                {selectedGroupData.keywords.length === 0 && (
                  <p className="text-sm text-muted dark:text-on-dark-soft text-center py-6">No keywords yet. Add one above.</p>
                )}
                {selectedGroupData.keywords.map(kw => {
                  const ks = getKeywordStats(kw.id)
                  const health = getHealthStatus(ks.total, ks.positive, ks.negative)
                  const HealthIcon = health.icon
                  const isEditing = editingKeyword?.kw.id === kw.id

                  return (
                    <div key={kw.id} className="border border-hairline dark:border-white/8 rounded-xl p-4">
                      {isEditing ? (
                        <KeywordForm
                          keyword={kw}
                          groupColor={selectedGroupData.color}
                          saving={saving}
                          onSave={(kwData) => handleSaveKeyword(selectedGroupData.id, kwData)}
                          onCancel={() => setEditingKeyword(null)}
                        />
                      ) : (
                        <>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <HealthIcon size={14} style={{ color: health.color }} />
                                <span className="text-sm font-semibold text-ink dark:text-on-dark">{kw.term}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {movingKeyword === kw.id ? (
                                <div className="flex items-center gap-1.5">
                                  <select
                                    autoFocus
                                    className="text-xs border border-hairline-strong dark:border-white/8 rounded-lg px-2 py-1 bg-white dark:bg-surface-dark-elevated dark:text-on-dark focus:outline-none focus:border-ink dark:focus:border-white/30"
                                    defaultValue=""
                                    onChange={e => {
                                      if (e.target.value) {
                                        handleMoveKeyword(kw.id, kw.term, e.target.value)
                                        setMovingKeyword(null)
                                      }
                                    }}
                                  >
                                    <option value="" disabled>Move to…</option>
                                    {groups.filter(g => g.id !== selectedGroupData.id).map(g => (
                                      <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                  </select>
                                  <button onClick={() => setMovingKeyword(null)} className="p-1 rounded hover:bg-surface-strong">
                                    <X size={12} className="text-muted" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {false && <button
                                    onClick={() => { setShowLog(true); runIngest([kw.id]) }}
                                    disabled={running}
                                    className="p-1.5 rounded-lg hover:bg-surface-strong dark:hover:bg-white/8 transition-colors disabled:opacity-40"
                                    title="Fetch mentions for this keyword"
                                  >
                                    {running && fetchingIds.includes(kw.id)
                                      ? <Loader size={13} className="animate-spin text-ink" />
                                      : <Download size={13} className="text-muted" />}
                                  </button>}
                                  <button
                                    onClick={() => setMovingKeyword(kw.id)}
                                    className="p-1.5 rounded-lg hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
                                    title="Move to group"
                                  >
                                    <FolderInput size={13} className="text-muted" />
                                  </button>
                                  <button
                                    onClick={() => setEditingKeyword({ groupId: selectedGroupData.id, kw })}
                                    className="p-1.5 rounded-lg hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
                                    title="Edit"
                                  >
                                    <Edit2 size={13} className="text-muted" />
                                  </button>
                                  <div className="relative">
                                    <button
                                      onClick={() => setGearOpen(gearOpen === kw.id ? null : kw.id)}
                                      className="p-1.5 rounded-lg hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
                                      title="More options"
                                    >
                                      <Settings size={13} className="text-muted" />
                                    </button>
                                    {gearOpen === kw.id && (
                                      <GearPopover
                                        keyword={kw}
                                        onClose={() => setGearOpen(null)}
                                        onDelete={() => setDeleteModal({ kwId: kw.id, kwTerm: kw.term, mentionCount: getKeywordStats(kw.id).total })}
                                      />
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <Activity size={12} className="text-muted" />
                            <span className="text-xs text-body dark:text-on-dark-soft">{health.label}</span>
                          </div>
                          {ks.total === 0 ? null : (
                            <KeywordMiniBar {...ks} />
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
