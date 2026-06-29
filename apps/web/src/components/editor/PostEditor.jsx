import React, { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import EditorToolbar from './EditorToolbar'

/* -----------------------------------------------------------------------
 * PostEditor — Tiptap rich-text editor for posts
 *
 * Props:
 *   content      {string}    HTML content (controlled)
 *   onChange     {Function}  Called with new HTML whenever the content changes
 *   placeholder  {string}    Placeholder text shown when editor is empty
 * ----------------------------------------------------------------------- */

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

async function uploadToCloudinary(file) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error(
      'VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET must be set to upload images.'
    )
  }
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: form }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cloudinary upload failed: ${text}`)
  }
  const json = await res.json()
  return json.secure_url
}

export default function PostEditor({ content = '', onChange, placeholder = 'Start writing…' }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      Youtube.configure({ nocookie: true, modestbranding: 1 }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate({ editor }) {
      onChange?.(editor.getHTML())
    },
  })

  // Keep editor in sync when the content prop changes externally
  // (e.g. loading an existing post for editing)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (content !== current) {
      editor.commands.setContent(content || '', false)
    }
  // Only run when content prop identity changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  async function handleImageUpload(file) {
    try {
      const url = await uploadToCloudinary(file)
      editor?.chain().focus().setImage({ src: url }).run()
    } catch (err) {
      // Surface the error to the console; the calling page shows toasts
      console.error('[PostEditor] image upload failed:', err)
      throw err
    }
  }

  return (
    <div className="gc-post-editor">
      <EditorToolbar editor={editor} onImageUpload={handleImageUpload} />
      <EditorContent editor={editor} className="gc-post-editor__content" />
    </div>
  )
}
