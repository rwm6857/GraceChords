import React, { useEffect, useMemo, useRef, useState } from 'react'
import resourcesData from '../data/resources.json'
import { parseFrontmatter, mdToHtml, slugifyKebab } from '../utils/markdown'
import { fetchTextCached } from '../utils/fetchCache'
import * as GH from '../utils/github'
import Toolbar from '../components/ui/Toolbar'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import AdminPrModal from '../components/admin/AdminPrModal'
import { CloudUploadIcon, DownloadIcon, PlusIcon, SearchIcon } from '../components/Icons'
import '../styles/admin.css'

const PASSWORD = import.meta.env.VITE_ADMIN_PW

export default function AdminResources(){
  const [ok, setOk] = useState(false)
  const [pw, setPw] = useState('')
  if(!ok){
    return (
      <div className="container" style={{maxWidth:480}}>
        <h1>Admin: Resources</h1>
        <p>Enter password to continue.</p>
        <form onSubmit={(e)=>{ e.preventDefault(); setOk(pw===PASSWORD) }}>
          <Input id="adminPw" type="password" value={pw} onChange={e=> setPw(e.target.value)} placeholder="Password" />
          <div style={{marginTop:8, display:'flex', justifyContent:'flex-end'}}>
            <Button variant="primary" type="submit">Enter</Button>
          </div>
        </form>
      </div>
    )
  }
  return <ResourceEditor />
}

function ResourceEditor(){
  const [list] = useState(() => (resourcesData?.items || []).slice().sort((a,b)=> (b.date||'').localeCompare(a.date||'')))
  const [slug, setSlug] = useState('')
  const [meta, setMeta] = useState({ title:'', author:'', date: new Date().toISOString().slice(0,10), tags:[], summary:'' })
  const [body, setBody] = useState('')
  const [editsAuthor, setEditsAuthor] = useState(() => {
    try { return localStorage.getItem('admin:editsAuthor') || '' } catch { return '' }
  })
  useEffect(() => {
    try { localStorage.setItem('admin:editsAuthor', editsAuthor || '') } catch {}
  }, [editsAuthor])

  function newPost(){
    setSlug('')
    setMeta({ title:'', author:'', date: new Date().toISOString().slice(0,10), tags:[], summary:'' })
    setBody('')
  }

  async function loadExisting(s){
    if(!s) return
    const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/,'') + '/'
    const url = `${base}resources/${s.slug}.md`
    const txt = await fetchTextCached(url)
    const fm = parseFrontmatter(txt)
    setSlug(s.slug)
    setMeta({
      title: String(fm.meta.title || s.title || ''),
      author: String(fm.meta.author || s.author || ''),
      date: String(fm.meta.date || s.date || new Date().toISOString().slice(0,10)),
      tags: Array.isArray(fm.meta.tags) ? fm.meta.tags : [],
      summary: String(fm.meta.summary || s.summary || ''),
    })
    setBody(fm.content || '')
  }

  function setTitle(t){
    setMeta(m => ({ ...m, title: t }))
    if(!slug) setSlug(slugifyKebab(t))
  }
  function setAuthor(v){ setMeta(m => ({ ...m, author: v })) }
  function setDate(v){ setMeta(m => ({ ...m, date: v })) }
  function setTags(v){
    const arr = String(v || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
    setMeta(m => ({ ...m, tags: arr }))
  }
  function setSummary(v){ setMeta(m => ({ ...m, summary: v })) }

  const previewHtml = useMemo(() => mdToHtml(body), [body])

  // staging for PR
  const [staged, setStaged] = useState([])
  const [prOpen, setPrOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [defaultBranch, setDefaultBranch] = useState('main')
  const [ghUser, setGhUser] = useState(null)

  function composeFile(){
    const fm = [
      '---',
      `title: "${(meta.title||'').replace(/"/g,'\\"')}"`,
      `author: "${(meta.author||'').replace(/"/g,'\\"')}"`,
      `date: "${meta.date || ''}"`,
      `tags: ${JSON.stringify(meta.tags||[])} `,
      `summary: "${(meta.summary||'').replace(/"/g,'\\"')}"`,
      '---',
      '',
    ].join('\n')
    return fm + (body || '')
  }

  function stage(){
    const finalSlug = slug || slugifyKebab(meta.title || 'untitled')
    const filename = `${finalSlug}.md`
    const content = composeFile()
    const item = { filename, content, title: meta.title, commitMsg: `${resourcesData?.items?.some(it=> it.slug===finalSlug) ? 'update' : 'add'}: ${filename}` }
    setStaged([item])
  }

  async function openPr(){
    try {
      const { default_branch } = await GH.getRepoInfo({ owner: 'rwm6857', repo: 'GraceChords' })
      setDefaultBranch(default_branch || 'main')
      if (!String(editsAuthor || '').trim()){
        alert('Please enter your name in the Edits Author field before submitting.')
        return
      }
      if (!staged.length) stage()
      setPrOpen(true)
    } catch (e) {
      alert(String(e?.message || e))
    }
  }

  async function onCreatePr({ branchName, prTitle, prBody }){
    setBusy(true)
    try {
      const owner = 'rwm6857', repo = 'GraceChords'
      const { sha } = await GH.getRepoInfo({ owner, repo })
      await GH.createBranch({ owner, repo, fromSha: sha, newBranch: branchName })
      for(const f of staged){
        const path = `public/resources/${f.filename}`
        const existingSha = await GH.getFileSha({ owner, repo, path, ref: branchName })
        const msg = (f.commitMsg && f.commitMsg.trim()) ? f.commitMsg.trim() : `add: ${f.filename}`
        await GH.putFile({ owner, repo, branch: branchName, path, contentBase64: GH.toBase64(f.content), message: msg, sha: existingSha })
      }
      const appendedBody = `${prBody || ''}${prBody ? '\n\n' : ''}Submitted by: ${String(editsAuthor || '').trim()}`
      const pr = await GH.createPR({ owner, repo, head: branchName, base: defaultBranch, title: prTitle, body: appendedBody })
      window.open(pr.html_url, '_blank', 'noopener')
      setStaged([])
      setPrOpen(false)
    } finally { setBusy(false) }
  }

  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      <h1>Admin: Resources</h1>

      {/* GitHub token helpers */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="Row" style={{ alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <strong>GitHub:</strong>
          <span>Token: {ghUser ? `@${ghUser.login}` : (localStorage.getItem('ghToken') ? 'set' : 'not set')}</span>
          <button className="btn" onClick={()=> { const t = prompt('Paste GitHub token (repo scope):',''); if(t!==null){ localStorage.setItem('ghToken', t.trim()) } }}>Set token</button>
          <button className="btn" onClick={()=> { localStorage.removeItem('ghToken'); setGhUser(null) }}>Clear token</button>
          <button className="btn" onClick={async ()=> { try { const u = await GH.validateToken(); setGhUser(u); alert(`Token OK: ${u.login}`) } catch(e){ setGhUser(null); alert(String(e?.message || e)) } }}>Validate</button>
          <div className="spacer" />
          <label className="Small" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span>Edits Author <span aria-hidden style={{ color:'#ef4444' }}>*</span></span>
            <input value={editsAuthor} onChange={e=> setEditsAuthor(e.target.value)} placeholder="Your name" style={{ minWidth:180 }} />
          </label>
        </div>
      </div>

      {/* Existing posts */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>Existing posts</strong>
        <div className="Row Small" style={{ marginTop: 6, gap: 8, flexWrap:'wrap' }}>
          {list.map(s => (
            <button key={s.slug} className="gc-btn gc-btn--sm" onClick={()=> loadExisting(s)} title={`Edit ${s.title}`}>{s.title}</button>
          ))}
          <span className="spacer" />
          <Button onClick={newPost} iconLeft={<PlusIcon />}>New Post</Button>
        </div>
      </div>

      {/* Form */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10 }}>
          <label>Title
            <input value={meta.title} onChange={e=> setTitle(e.target.value)} />
          </label>
          <label>Author
            <input value={meta.author} onChange={e=> setAuthor(e.target.value)} />
          </label>
          <label>Date
            <input type="date" value={meta.date} onChange={e=> setDate(e.target.value)} />
          </label>
          <label>Tags (comma-separated)
            <input value={(meta.tags||[]).join(', ')} onChange={e=> setTags(e.target.value)} placeholder="leadership, vocals" />
          </label>
          <label>Summary
            <input value={meta.summary} onChange={e=> setSummary(e.target.value)} />
          </label>
          <label>Slug
            <input value={slug} onChange={e=> setSlug(e.target.value)} placeholder="auto from title" />
          </label>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <div className="Row Small" style={{ justifyContent:'space-between' }}>
              <strong>Content (Markdown)</strong>
            </div>
            <textarea value={body} onChange={e=> setBody(e.target.value)} style={{ width:'100%', minHeight:'50vh', fontFamily:'"Roboto Mono", ui-monospace, Menlo, Consolas, monospace' }} />
          </div>
          <div>
            <strong>Preview</strong>
            <div className="card" style={{ minHeight:'50vh', overflow:'auto', padding: 10 }}>
              <div className="Small" style={{ opacity: 0.9, marginBottom: 6 }}>
                {meta.title ? <div><strong>{meta.title}</strong></div> : null}
                <div>by {meta.author || '—'} • {meta.date || '—'}</div>
                {meta.tags?.length ? (
                  <div className="Small" style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop: 4 }}>
                    {meta.tags.map(t => <span key={t} className="gc-tag gc-tag--gray">{t}</span>)}
                  </div>
                ) : null}
                {meta.summary ? <div style={{ marginTop: 4 }}>{meta.summary}</div> : null}
              </div>
              <div className="PostBody" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <Toolbar style={{ position:'sticky', bottom: 0, marginTop: 12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <Button onClick={newPost}><PlusIcon /> New</Button>
          <Button onClick={stage}><SearchIcon /> Validate</Button>
          <Button onClick={stage}><PlusIcon /> Stage</Button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
          <label className="Small" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span>Filename</span>
            <input readOnly value={`${(slug || slugifyKebab(meta.title || 'untitled'))}.md`} style={{ width: 320 }} />
          </label>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <Button className="gc-btn gc-btn--primary" onClick={openPr}><CloudUploadIcon /> Publish</Button>
        </div>
      </Toolbar>
      <AdminPrModal
        open={prOpen}
        onClose={() => setPrOpen(false)}
        defaultBranch={defaultBranch}
        staged={staged}
        onCreate={onCreatePr}
        busy={busy}
      />
    </div>
  )
}
