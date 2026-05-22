import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Edit2, Trash2, Tag, ArrowLeft, ChevronDown,
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

function Modal({ title, onClose, children, width = 'max-w-md' }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/40 px-4 animate-fade-in"
      style={{ alignItems: 'flex-start', paddingTop: '8vh' }}
      onClick={onClose}
    >
      <div
        className={clsx('bg-white dark:bg-surface-dark-elevated rounded-2xl shadow-2xl w-full border border-transparent dark:border-white/8 overflow-hidden animate-modal-in', width)}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline dark:border-white/8">
          <h3 className="text-sm font-semibold text-ink dark:text-on-dark">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-strong dark:hover:bg-white/8 transition-colors">
            <X size={14} className="text-muted" />
          </button>
        </div>
        <div className="p-5 pb-[1.65rem]">
          {children}
        </div>
      </div>
    </div>
  )
}

function KeywordMiniBar({ positive, negative, neutral, total }) {
  if (!total) return <div className="text-xs text-muted">No data</div>
  const posPct = Math.round(positive / total * 100)
  const negPct = Math.round(negative / total * 100)
  const neuPct = 100 - posPct - negPct
  return (
    <div className="space-y-1">
      <div className="flex h-3 rounded-full overflow-hidden">
        <div style={{ width: `${posPct}%`, backgroundColor: SENTIMENT_COLORS.positive }} />
        <div style={{ width: `${neuPct}%`, backgroundColor: SENTIMENT_COLORS.neutral }} />
        <div style={{ width: `${negPct}%`, backgroundColor: SENTIMENT_COLORS.negative }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="text-teal">{posPct}% positive</span>
        <span style={{ color: SENTIMENT_COLORS.neutral }}>{neuPct}% neutral</span>
        <span className="text-orange">{negPct}% negative</span>
        <span className="text-muted">{total} mentions</span>
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
      <div className="h-48 overflow-y-auto px-4 py-3 space-y-0.5 font-mono text-[0.6875rem]">
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
    <div className="space-y-3">
      <div>
        <label className="section-label">Group Name</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(name); if (e.key === 'Escape') onCancel() }}
          className="form-input mt-1"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 py-2 text-xs font-medium text-body dark:text-on-dark-soft border border-hairline-strong dark:border-white/8 rounded-lg hover:bg-surface-strong dark:hover:bg-white/8 transition-colors">
          Cancel
        </button>
        <button onClick={() => onSave(name)} disabled={!name.trim()} className="flex-1 py-2 text-xs font-medium text-white bg-[#2940BE] rounded-lg hover:bg-[#2940BE]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Save
        </button>
      </div>
    </div>
  )
}

function DeleteKeywordModal({ keyword, mentionCount, onConfirm, onCancel, saving }) {
  const [choice, setChoice] = useState(null)

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40 px-4 animate-fade-in" style={{ alignItems: 'flex-start', paddingTop: '8vh' }}>
      <div className="bg-white dark:bg-surface-dark-elevated rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-transparent dark:border-white/8 animate-modal-in">
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
              'flex-1 py-2 text-xs font-medium text-on-dark rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed',
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
  const [aliases, setAliases] = useState((keyword?.aliases || []).join(', '))

  const handleSave = () => {
    if (!term.trim()) return
    const parsedAliases = aliases.split(',').map(a => a.trim()).filter(Boolean)
    onSave({
      id: keyword?.id || `kw-${Date.now()}`,
      term: term.trim(),
      aliases: parsedAliases,
    })
  }

  return (
    <div className="space-y-2.5">
      <div>
        <label className="section-label">Keyword</label>
        <input
          type="text"
          value={term}
          onChange={e => setTerm(e.target.value)}
          className="form-input mt-1"
          placeholder="e.g. UEM Edgenta"
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
        <p className="text-[0.625rem] text-muted mt-1">Words in ALL CAPS are matched case-sensitively. Mixed case words match case-insensitively.</p>
      </div>
      <div>
        <label className="section-label">Aliases <span className="font-normal text-muted">(comma-separated, optional)</span></label>
        <input
          type="text"
          value={aliases}
          onChange={e => setAliases(e.target.value)}
          className="form-input mt-1"
          placeholder="e.g. UEM Edgenta Berhad, Edgenta"
        />
        <p className="text-[0.625rem] text-muted mt-1">Each alias will be searched separately but grouped under this keyword.</p>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 py-2 text-xs font-medium text-body dark:text-on-dark-soft border border-hairline-strong dark:border-white/8 rounded-lg hover:bg-surface-strong dark:hover:bg-white/8 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!term.trim() || saving}
          className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-[#2940BE] rounded-lg hover:bg-[#2940BE]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader size={12} className="animate-spin" /> : null}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export default function KeywordManager() {
  const { globalFilteredMentions: filteredMentions, updateMentionGroups, reloadMentions } = useDashboard()
  const { running, logs, fetchingIds, run: runIngest } = useIngest({ onDone: reloadMentions })
  const [showLog, setShowLog] = useState(false)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [groupSheetOpen, setGroupSheetOpen] = useState(false)
  const [editingKeyword, setEditingKeyword] = useState(null)
  const [addingToGroup, setAddingToGroup] = useState(null)
  const [movingKeyword, setMovingKeyword] = useState(null)
  const [gearOpen, setGearOpen] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)
  const [editingGroup, setEditingGroup] = useState(null)
  const [toast, setToast] = useState(null)
  const [groupDeleteAlert, setGroupDeleteAlert] = useState(false)
  const [addGroupModal, setAddGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

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
      aliases: kwData.aliases || [],
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

  const handleAddGroup = () => {
    setNewGroupName('')
    setAddGroupModal(true)
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return
    const name = newGroupName.trim()
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const colors = ['#2940BE', '#1490EA', '#732BCC', '#E97132', '#19C9A5', '#F59E0B', '#EF4444']
    const color = colors[groups.length % colors.length]
    const { error } = await supabase.from('keyword_groups').insert({ id, name, color })
    if (error) {
      showToast('Failed to create group', 'error')
    } else {
      showToast(`Group "${name}" created`)
      setAddGroupModal(false)
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
    <div className="flex gap-4 h-[calc(100vh-7rem)] relative overflow-hidden">
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

      {/* Rename group modal */}
      {editingGroup === selectedGroupData?.id && (
        <Modal title="Rename Group" onClose={() => setEditingGroup(null)}>
          <GroupNameEditor
            group={selectedGroupData}
            onSave={(name) => handleRenameGroup(selectedGroupData.id, name)}
            onCancel={() => setEditingGroup(null)}
          />
        </Modal>
      )}

      {/* Delete group alert modal */}
      {groupDeleteAlert && (
        <Modal title="Cannot Delete Group" onClose={() => setGroupDeleteAlert(false)}>
          <p className="text-sm text-body dark:text-on-dark-soft mb-4">
            This group still has <span className="font-semibold text-ink dark:text-on-dark">{selectedGroupData?.keywords.length} keyword{selectedGroupData?.keywords.length !== 1 ? 's' : ''}</span> inside. Please delete all keywords within the group before deleting the group itself.
          </p>
          <button
            onClick={() => setGroupDeleteAlert(false)}
            className="w-full py-2 text-xs font-medium text-white bg-[#2940BE] rounded-lg hover:bg-[#2940BE]/90 transition-colors"
          >
            OK
          </button>
        </Modal>
      )}

      {/* Add keyword modal */}
      {addingToGroup === selectedGroupData?.id && (
        <Modal title="Add Keyword" onClose={() => setAddingToGroup(null)}>
          <KeywordForm
            groupColor={selectedGroupData.color}
            saving={saving}
            onSave={(kw) => handleSaveKeyword(selectedGroupData.id, kw)}
            onCancel={() => setAddingToGroup(null)}
          />
        </Modal>
      )}

      {/* Edit keyword modal */}
      {editingKeyword && (
        <Modal title={`Edit "${editingKeyword.kw.term}"`} onClose={() => setEditingKeyword(null)}>
          <KeywordForm
            keyword={editingKeyword.kw}
            groupColor={selectedGroupData?.color}
            saving={saving}
            onSave={(kwData) => handleSaveKeyword(editingKeyword.groupId, kwData)}
            onCancel={() => setEditingKeyword(null)}
          />
        </Modal>
      )}

      {/* New group modal */}
      {addGroupModal && (
        <Modal title="New Keyword Group" onClose={() => setAddGroupModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="section-label">Group Name</label>
              <input
                autoFocus
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateGroup() }}
                className="form-input mt-1"
                placeholder="e.g. Executives, Products, Competitors"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAddGroupModal(false)}
                className="flex-1 py-2 text-xs font-medium text-body dark:text-on-dark-soft border border-hairline-strong dark:border-white/8 rounded-lg hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || saving}
                className="flex-1 py-2 text-xs font-medium text-white bg-[#2940BE] rounded-lg hover:bg-[#2940BE]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create Group
              </button>
            </div>
          </div>
        </Modal>
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

      {/* Mobile group selector sheet backdrop */}
      {groupSheetOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setGroupSheetOpen(false)} />
      )}

      {/* Mobile group selector sheet */}
      <div className={clsx(
        'md:hidden fixed inset-x-0 bottom-0 z-50 bg-canvas dark:bg-surface-dark rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out',
        groupSheetOpen ? 'translate-y-0' : 'translate-y-full'
      )}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-hairline dark:border-white/8">
          <div className="absolute left-1/2 -translate-x-1/2 top-3 w-10 h-1 rounded-full bg-hairline-strong dark:bg-white/20" />
          <p className="text-base font-bold text-ink dark:text-on-dark">Keyword Groups</p>
          <button onClick={() => setGroupSheetOpen(false)} className="p-1.5 rounded-md hover:bg-surface-strong text-muted">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-3 pb-8 space-y-2">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => { setSelectedGroup(g); setGroupSheetOpen(false) }}
              className={clsx(
                'w-full flex items-center justify-between px-4 h-14 rounded-xl border text-sm font-medium transition-all text-left',
                selectedGroup?.id === g.id
                  ? 'bg-[#2940BE] border-[#2940BE] text-white'
                  : 'bg-canvas dark:bg-white/8 text-ink dark:text-on-dark border-hairline-strong dark:border-white/8 hover:border-ink/30 dark:hover:border-white/20'
              )}
            >
              <span>{g.name}</span>
              <span className={clsx(
                'text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center flex-shrink-0',
                selectedGroup?.id === g.id
                  ? 'bg-white/20 text-white'
                  : 'border border-hairline-strong dark:border-white/8 text-muted dark:text-on-dark-soft'
              )}>{g.keywords.length}</span>
            </button>
          ))}
          <button
            onClick={() => { handleAddGroup(); setGroupSheetOpen(false) }}
            className="w-full flex items-center justify-center gap-2 px-4 h-14 rounded-xl border border-dashed border-hairline-strong dark:border-white/8 text-sm font-medium text-ink dark:text-on-dark hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
          >
            <Plus size={15} /> New Group
          </button>
        </div>
      </div>

      {/* Left: Group list — desktop only */}
      <div className="hidden md:block w-64 flex-shrink-0 overflow-y-auto">
        <div className="card space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="section-label">Keyword Groups</p>
            <div className="flex items-center gap-1">
              {false && <button
                onClick={() => { setShowLog(true); runIngest() }}
                disabled={running}
                className="flex items-center gap-1 text-[0.625rem] text-ink dark:text-on-dark font-medium px-2 py-1 rounded-md hover:bg-surface-strong dark:hover:bg-white/8 transition-colors disabled:opacity-40"
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
                  'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all text-left',
                  isSelected
                    ? 'bg-[#2940BE] text-white border-[#2940BE]'
                    : 'bg-canvas dark:bg-white/8 text-body dark:text-on-dark-soft border-hairline-strong dark:border-white/8 hover:border-ink/30 dark:hover:border-white/20'
                )}
                onClick={() => setSelectedGroup(g)}
              >
                <span className="text-xs truncate">{g.name}</span>
                <span className={clsx(
                  'ml-auto text-[0.625rem] font-semibold rounded-full px-1.5 py-0.5',
                  isSelected
                    ? 'bg-white/20 text-on-dark border border-transparent'
                    : 'bg-canvas dark:bg-white/8 border border-hairline-strong dark:border-white/8 text-muted dark:text-on-dark-soft'
                )}>
                  {g.keywords.length}
                </span>
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
        {/* Mobile group selector bar */}
        <button
          onClick={() => setGroupSheetOpen(true)}
          className="md:hidden w-full flex items-center justify-between px-4 h-14 mb-3 rounded-xl border text-sm font-medium border-hairline-strong dark:border-white/8 bg-canvas dark:bg-surface-dark hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
        >
          {selectedGroupData
            ? <span className="font-semibold text-ink dark:text-on-dark">{selectedGroupData.name}</span>
            : <span className="text-muted">Select a group…</span>
          }
          <ChevronDown size={16} className="text-muted" />
        </button>

        {selectedGroupData && (
          <div className="space-y-4">
            {/* Group header */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="hidden md:block text-base font-semibold text-ink dark:text-on-dark">{selectedGroupData.name}</h2>
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
                    onClick={() => {
                      if (selectedGroupData.keywords.length > 0) {
                        setGroupDeleteAlert(true)
                      } else {
                        handleDeleteGroup(selectedGroupData.id, selectedGroupData.name)
                      }
                    }}
                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    title="Delete group"
                  >
                    <Trash2 size={13} className="text-red-400" />
                  </button>
                </div>
              </div>

              {/* Group stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                      <div className="text-[0.625rem] text-body dark:text-on-dark-soft mt-0.5">{stat.label}</div>
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
                    className="flex items-center gap-1.5 text-xs text-white px-3 py-1.5 rounded-lg transition-colors bg-ink dark:bg-on-dark dark:text-ink hover:bg-ink/80"
                  >
                    <Plus size={13} /> Add Keyword
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedGroupData.keywords.length === 0 && (
                  <p className="text-sm text-muted dark:text-on-dark-soft text-center py-6 col-span-2">No keywords yet. Add one above.</p>
                )}
                {selectedGroupData.keywords.map(kw => {
                  const ks = getKeywordStats(kw.id)
                  const health = getHealthStatus(ks.total, ks.positive, ks.negative)
                  const HealthIcon = health.icon

                  return (
                    <div key={kw.id} className="border border-hairline dark:border-white/8 rounded-xl p-4">
                      <div className="flex items-start gap-2 justify-between mb-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <HealthIcon size={14} style={{ color: health.color }} />
                            <span className="text-sm font-semibold text-ink dark:text-on-dark break-words">{kw.term}</span>
                          </div>
                          {kw.aliases?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1 ml-5">
                              {kw.aliases.map(alias => (
                                <span key={alias} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-surface-strong dark:bg-white/8 text-[0.625rem] text-muted dark:text-on-dark-soft border border-hairline dark:border-white/8">
                                  {alias}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {movingKeyword === kw.id ? (
                            <button onClick={() => setMovingKeyword(null)} className="p-1 rounded hover:bg-surface-strong">
                              <X size={13} className="text-muted" />
                            </button>
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
                      {movingKeyword === kw.id && (
                        <div className="flex items-center gap-2 mb-3">
                          <select
                            autoFocus
                            className="flex-1 text-xs border border-hairline-strong dark:border-white/8 rounded-lg px-2 py-1.5 bg-white dark:bg-surface-dark-elevated dark:text-on-dark focus:outline-none focus:border-ink dark:focus:border-white/30"
                            defaultValue=""
                            onChange={e => {
                              if (e.target.value) {
                                handleMoveKeyword(kw.id, kw.term, e.target.value)
                                setMovingKeyword(null)
                              }
                            }}
                          >
                            <option value="" disabled>Move to group…</option>
                            {groups.filter(g => g.id !== selectedGroupData.id).map(g => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <Activity size={12} className="text-muted" />
                        <span className="text-xs text-body dark:text-on-dark-soft">{health.label}</span>
                      </div>
                      {ks.total === 0 ? null : (
                        <KeywordMiniBar {...ks} />
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
