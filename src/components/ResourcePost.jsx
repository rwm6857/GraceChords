import React, { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useParams, Link } from 'react-router-dom'
import resourcesData from '../data/resources.json'
import { mdToHtml, parseFrontmatter, stripMarkdown } from '../utils/markdown'

const SITE_URL = 'https://gracechords.com'
const OG_IMAGE_URL = `${SITE_URL}/favicon.ico`

export default function ResourcePost(){
  const { slug } = useParams()
  const [raw, setRaw] = useState('')
  const [meta, setMeta] = useState({})
  const item = useMemo(() => (resourcesData?.items || []).find(it => it.slug === slug), [slug])
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/,'') + '/'
        const res = await fetch(`${base}resources/${slug}.md`)
        if(!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        const txt = await res.text()
        if (cancelled) return
        const fm = parseFrontmatter(txt)
        setRaw(fm.content || '')
        setMeta({ ...fm.meta })
      } catch(e){
        setErr(String(e?.message || e))
      }
    })()
    return () => { cancelled = true }
  }, [slug])

  const html = useMemo(() => mdToHtml(raw), [raw])
  const related = useMemo(() => {
    const tags = new Set((meta.tags || item?.tags || []))
    const arr = (resourcesData?.items || []).filter(it => it.slug !== slug && it.tags?.some(t => tags.has(t)))
    return arr.slice(0, 3)
  }, [slug, meta, item])
  const title = meta.title || item?.title || slug
  const description = useMemo(() => {
    const base = meta.summary || item?.summary
    if (base) return base
    const txt = stripMarkdown(raw)
    if (txt.length > 220) return `${txt.slice(0, 220).trim()}…`
    return txt || 'GraceChords resource article.'
  }, [meta, item, raw])
  const canonicalUrl = `${SITE_URL}/?resource=${encodeURIComponent(slug || '')}`

  return (
    <div className="container">
      <Helmet>
        <title>{title ? `${title} | GraceChords Resources` : 'GraceChords Resources'}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={title || 'GraceChords Resources'} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="GraceChords" />
        <meta property="og:image" content={OG_IMAGE_URL} />
        <link rel="canonical" href={canonicalUrl} />
        {meta.tags?.length ? <meta name="keywords" content={meta.tags.join(', ')} /> : null}
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: title,
          description,
          author: meta.author || item?.author || 'GraceChords',
          datePublished: meta.date || item?.date,
          dateModified: meta.date || item?.date,
          url: canonicalUrl
        })}</script>
      </Helmet>
      {err ? (
        <div className="alert error">{err}</div>
      ) : null}
      <article className="card" style={{ padding: 12 }}>
        <h1 style={{ margin: '4px 0', fontSize:'2.25rem', lineHeight:1.15 }}>{title}</h1>
        <div className="Small" style={{ opacity: 0.8 }}>
          by {meta.author || item?.author || '—'} • {fmtDate(meta.date || item?.date)}
        </div>
        {Array.isArray(meta.tags) && meta.tags.length ? (
          <div className="Small" style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
            {meta.tags.map(t => <span key={t} className="gc-tag gc-tag--gray">{t}</span>)}
          </div>
        ) : null}
        <div className="PostBody" style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: html }} />
      </article>
      {related.length ? (
        <div style={{ marginTop: 12 }}>
          <h3>Related</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
            {related.map(it => (
              <article key={it.slug} className="card" style={{ padding: 12 }}>
                <h4 style={{ margin:'4px 0' }}><Link to={`/resources/${it.slug}`}>{it.title}</Link></h4>
                <div className="Small" style={{ opacity: 0.8 }}>by {it.author} • {fmtDate(it.date)}</div>
                {it.summary ? <p style={{ margin:'6px 0 0 0' }}>{it.summary}</p> : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
      <div className="Small" style={{ marginTop: 16, opacity: 0.8 }}>
        Scripture quotations are from The ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway Bibles, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.
      </div>
    </div>
  )
}

function fmtDate(s){
  try { return new Date(s).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) } catch { return s }
}
