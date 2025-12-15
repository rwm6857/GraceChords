import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertImage,
  ListsToggle,
  MDXEditor,
  UndoRedo,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  toolbarPlugin,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { slugifyKebab } from '../../utils/markdown'

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

  return (
    <div className="gc-mdx-editor">
      <MDXEditor
        ref={editorRef}
        markdown={markdown}
        onChange={onChange}
        className="gc-mdx-editor__surface"
        contentEditableClassName="gc-mdx-editor__content"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          markdownShortcutPlugin(),
          imagePlugin({ imageUploadHandler }),
          toolbarPlugin({
            toolbarClassName: 'gc-mdx-toolbar',
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <BlockTypeSelect />
                <ListsToggle />
                <CreateLink />
                <InsertImage />
              </>
            )
          }),
        ]}
      />
    </div>
  )
})

export default PostMdxEditor
