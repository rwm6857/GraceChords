import React, { useState, useMemo } from 'react'

export default function AdminPrModal({
  open, onClose,
  defaultBranch,
  staged,
  onCreate,
  busy,
}) {
  if (!open) return null
  const today = new Date()
  const defaultBranchName = `song-upload-${today.toISOString().replace(/[:T]/g,'-').slice(0,19)}`
  const [branchName, setBranchName] = useState(defaultBranchName)
  const [prTitle, setPrTitle] = useState(`Add ${staged.length} songs (${today.toISOString().slice(0,10)})`)
  const defaultBody = useMemo(
    () => staged.map(s => `- ${s.filename}${s.title ? ` — ${s.title}` : ''}`).join('\n'),
    [staged]
  )
  const [prBody, setPrBody] = useState(defaultBody)
  const [error, setError] = useState('')

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
