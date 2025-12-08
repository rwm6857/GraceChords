import React, { useEffect, useState } from 'react'

export default function AdminPrModal({
  open, onClose,
  defaultBranch,
  staged,
  onCreate,
  busy,
  authorName = '',
}) {
  const [branchName, setBranchName] = useState('')
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [error, setError] = useState('')

  const hasStructuredStaging = Array.isArray(staged) && staged.some(it => it?.action)

  function buildDefaultTitle(){
    const now = new Date()
    if (hasStructuredStaging && authorName) {
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const yy = String(now.getFullYear()).slice(-2)
      const hh = String(now.getHours()).padStart(2, '0')
      const min = String(now.getMinutes()).padStart(2, '0')
      return `Song/Resource Update - ${mm}${dd}${yy} ${hh}:${min} by ${authorName}`
    }
    return `Add ${staged?.length || 0} files (${now.toISOString().slice(0,10)})`
  }

  function buildDefaultBody(){
    if (!hasStructuredStaging) {
      return (staged || []).map(s => `- ${s.filename}${s.title ? ` — ${s.title}` : ''}`).join('\n')
    }
    const newItems = staged.filter(i => i.action === 'add')
    const editedItems = staged.filter(i => i.action === 'edit')
    const deleteItems = staged.filter(i => i.action === 'delete-request')
    const kindLabel = (kind) => kind === 'song' ? 'Song' : 'Post'
    function lineForNew(it) {
      return `(${kindLabel(it.kind)}) ${it.title}`
    }
    function lineForEdit(it) {
      const suffix = it.changeSummary ? ` - ${it.changeSummary}` : ''
      return `(${kindLabel(it.kind)}) ${it.title}${suffix}`
    }
    function lineForDelete(it) {
      const suffix = it.deleteReason ? ` - ${it.deleteReason}` : ''
      return `(${kindLabel(it.kind)}) ${it.title}${suffix}`
    }
    const bodyLines = []
    bodyLines.push('NEW CONTENT:')
    bodyLines.push(newItems.length ? newItems.map(lineForNew).join('\n') : '(none)')
    bodyLines.push('')
    bodyLines.push('EDITED CONTENT:')
    bodyLines.push(editedItems.length ? editedItems.map(lineForEdit).join('\n') : '(none)')
    bodyLines.push('')
    bodyLines.push('DELETION REQUESTS:')
    bodyLines.push(deleteItems.length ? deleteItems.map(lineForDelete).join('\n') : '(none)')
    return bodyLines.join('\n')
  }

  useEffect(() => {
    if (!open) return
    const now = new Date()
    const defaultBranchName = `content-update-${now.toISOString().replace(/[:T]/g,'-').slice(0,19)}`
    setBranchName(defaultBranchName)
    setPrTitle(buildDefaultTitle())
    setPrBody(buildDefaultBody())
    setError('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  async function submit() {
    setError('')
    if (!staged.length) return setError('No staged files.')
    if (!branchName.trim()) return setError('Branch name is required.')
    try {
      await onCreate({ branchName: branchName.trim(), prTitle: prTitle.trim(), prBody })
    } catch (e) {
      setError(String(e?.message || e))
    }
  }

  return (
    <div className="modal">
      <div className="modal-body">
        <h3>Create Pull Request</h3>

        <div className="Row Small"><strong>Base:</strong> {defaultBranch}</div>

        <label>Branch name
          <input value={branchName} onChange={e=> setBranchName(e.target.value)} />
        </label>
        <label>PR Title
          <input value={prTitle} onChange={e=> setPrTitle(e.target.value)} />
        </label>
        <label>PR Body
          <textarea rows={5} value={prBody} onChange={e=> setPrBody(e.target.value)} />
        </label>

        {!!error && <div className="alert error">{error}</div>}

        <div className="Row" style={{justifyContent:'flex-end', gap:8}}>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : 'Create PR'}
          </button>
        </div>
      </div>
    </div>
  )
}
