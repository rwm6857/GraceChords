import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertImage,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  UndoRedo,
  GenericDirectiveEditor,
  directivesPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import '../../styles/mdxeditor.css'
import { extractYoutubeId, slugifyKebab } from '../../utils/markdown'
import { currentTheme } from '../../utils/theme'
import { Button } from '../ui/layout-kit'

function sanitizeFilename(name = '', mime = '', taken = []){
  const lower = String(name || '').toLowerCase()
  const extMatch = /\.([a-z0-9]+)$/.exec(lower)
  const fallbackExt = mime && /^image\/(png|jpeg|jpg|gif|webp|svg)/.test(mime) ? mime.replace('image/','') : ''
  const ext = extMatch ? extMatch[0] : (fallbackExt ? `.${fallbackExt}` : '.png')
  const base = (extMatch ? lower.replace(extMatch[0], '') : lower) || 'image'
  const safeBase = base.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'image'
  let candidate = `${safeBase}${ext}`
  let i = 1
  const takenSet = new Set(taken)
  while (takenSet.has(candidate)) {
    candidate = `${safeBase}-${i}${ext}`
    i += 1
  }
  return candidate
}

function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result
      if (typeof res === 'string') {
        resolve(res.replace(/^data:[^;]+;base64,/, ''))
      } else {
        reject(new Error('Unable to read file'))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const PostMdxEditor = forwardRef(function PostMdxEditor({
  markdown = '',
  onChange = () => {},
  slug = '',
  onAddAsset = () => {},
  assetNames = [],
}, ref){
  const editorRef = useRef(null)
  const [isDark, setIsDark] = useState(() => {
    try {
      if (typeof currentTheme === 'function') return currentTheme() === 'dark'
      if (window.matchMedia) return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch {}
    return false
  })
  const [videoInput, setVideoInput] = useState('')
  const [videoOpen, setVideoOpen] = useState(false)
  const [videoError, setVideoError] = useState('')
  const safeSlug = useMemo(() => slugifyKebab(slug || 'untitled') || 'untitled', [slug])

  useImperativeHandle(ref, () => ({
    insertMarkdown(snippet = ''){
      if (editorRef.current?.insertMarkdown) {
        editorRef.current.insertMarkdown(snippet)
      } else {
        onChange((markdown || '') + (snippet ? `\n${snippet}` : ''))
      }
    }
  }), [markdown, onChange])

  const imageUploadHandler = async (file) => {
    if (!file) return ''
    const filename = sanitizeFilename(file.name, file.type, assetNames)
    const path = `public/uploads/resources/${safeSlug}/${filename}`
    const content = await fileToBase64(file)
    onAddAsset({
      kind: 'asset',
      action: 'add',
      path,
      filename,
      title: 'asset',
      content,
      contentBase64: content,
      contentIsBase64: true,
    })
    return `/uploads/resources/${safeSlug}/${filename}`
  }

  const handleThemeChange = useCallback(() => {
    try {
      if (typeof currentTheme === 'function') {
        setIsDark(currentTheme() === 'dark')
        return
      }
    } catch {}
    try {
      if (window.matchMedia) {
        setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
      }
    } catch {}
  }, [])

  useEffect(() => {
    handleThemeChange()
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(m => m.attributeName === 'data-theme')) {
        handleThemeChange()
      }
    })
    try {
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    } catch {}
    let mq
    const mqListener = (e) => setIsDark(Boolean(e?.matches))
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq?.addEventListener?.('change', mqListener)
      mq?.addListener?.(mqListener) // safari fallback
    } catch {}
    return () => {
      observer.disconnect()
      try { mq?.removeEventListener?.('change', mqListener) } catch {}
      try { mq?.removeListener?.(mqListener) } catch {}
    }
  }, [handleThemeChange])

  const handleInsertYoutube = useCallback((id) => {
    if (!id) return
    const snippet = `\n\n::youtube{id="${id}"}\n\n`
    if (editorRef.current?.insertMarkdown) {
      editorRef.current.insertMarkdown(snippet)
    } else {
      onChange((markdown || '').replace(/\s*$/, '\n\n') + snippet)
    }
  }, [markdown, onChange])

  const submitVideo = useCallback((e) => {
    e?.preventDefault?.()
    const id = extractYoutubeId(videoInput)
    if (!id) {
      setVideoError('Enter a valid YouTube URL or ID.')
      return
    }
    setVideoError('')
    handleInsertYoutube(id)
    setVideoInput('')
    setVideoOpen(false)
  }, [videoInput, handleInsertYoutube])

  const closeVideoDialog = useCallback(() => {
    setVideoOpen(false)
    setVideoError('')
  }, [])

  useEffect(() => {
    function onKey(e){
      if (e.key === 'Escape') {
        closeVideoDialog()
      }
    }
    if (videoOpen) {
      window.addEventListener('keydown', onKey)
    }
    return () => window.removeEventListener('keydown', onKey)
  }, [videoOpen, closeVideoDialog])

  const youtubeDirectiveDescriptor = useMemo(() => ({
    name: 'youtube',
    testNode: (node) => node?.name === 'youtube',
    attributes: ['id'],
    hasChildren: false,
    type: 'leafDirective',
    Editor: GenericDirectiveEditor,
  }), [])

  return (
    <div className="gc-mdxeditor gc-mdx-editor">
      <MDXEditor
        ref={editorRef}
        markdown={markdown}
        onChange={onChange}
        className={`gc-mdxeditor__surface ${isDark ? 'dark-theme' : 'light-theme'}`}
        contentEditableClassName="gc-mdxeditor__content gc-mdxeditor-prose"
        plugins={[
          directivesPlugin({ directiveDescriptors: [youtubeDirectiveDescriptor] }),
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          markdownShortcutPlugin(),
          imagePlugin({ imageUploadHandler }),
          toolbarPlugin({
            toolbarClassName: 'gc-mdxeditor__toolbar',
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <BlockTypeSelect />
                <ListsToggle />
                <CreateLink />
                <InsertImage />
                <InsertThematicBreak />
                <div className="gc-mdxeditor__custom-group">
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() => setVideoOpen(v => !v)}
                    aria-expanded={videoOpen}
                    aria-label="Embed YouTube video"
                  >
                    Embed Video
                  </Button>
                  {videoOpen && (
                    <form className="gc-mdxeditor__popover" onSubmit={submitVideo}>
                      <label className="gc-mdxeditor__popover-label">
                        YouTube URL or ID
                        <input
                          autoFocus
                          value={videoInput}
                          onChange={e => { setVideoInput(e.target.value); setVideoError('') }}
                          placeholder="https://youtu.be/abcd1234xyz or abcd1234xyz"
                        />
                      </label>
                      {videoError ? <div className="gc-mdxeditor__popover-error">{videoError}</div> : null}
                      <div className="gc-mdxeditor__popover-actions">
                        <Button size="sm" variant="ghost" onClick={closeVideoDialog}>Cancel</Button>
                        <Button size="sm" variant="primary" type="submit">Insert</Button>
                      </div>
                    </form>
                  )}
                </div>
              </>
            )
          }),
        ]}
      />
    </div>
  )
})

export default PostMdxEditor
