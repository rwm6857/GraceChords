import React, { useRef } from 'react'

/* -----------------------------------------------------------------------
 * EditorToolbar — action bar for PostEditor
 * Renders a row of formatting buttons that operate on a Tiptap `editor`
 * instance passed as a prop.
 * ----------------------------------------------------------------------- */

function ToolBtn({ active, disabled, title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`gc-editor-toolbar__btn${active ? ' is-active' : ''}`}
      aria-pressed={active ? 'true' : 'false'}
    >
      {children}
    </button>
  )
}

export default function EditorToolbar({ editor, onImageUpload }) {
  const fileRef = useRef(null)

  if (!editor) return null

  function addLink() {
    const prev = editor.getAttributes('link').href || ''
    const url = window.prompt('Enter URL', prev)
    if (url === null) return
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  function addYoutube() {
    const url = window.prompt('Paste a YouTube URL')
    if (!url) return
    editor.commands.setYoutubeVideo({ src: url, width: 640, height: 360 })
  }

  function triggerFileInput() {
    fileRef.current?.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (onImageUpload) {
      await onImageUpload(file)
    }
  }

  const can = editor.can()

  return (
    <div className="gc-editor-toolbar" role="toolbar" aria-label="Text formatting">
      {/* --- Text style --- */}
      <div className="gc-editor-toolbar__group">
        <ToolBtn
          title="Bold (Ctrl+B)"
          active={editor.isActive('bold')}
          disabled={!can.toggleBold?.()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </ToolBtn>
        <ToolBtn
          title="Italic (Ctrl+I)"
          active={editor.isActive('italic')}
          disabled={!can.toggleItalic?.()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </ToolBtn>
      </div>

      <div className="gc-editor-toolbar__sep" aria-hidden="true" />

      {/* --- Headings --- */}
      <div className="gc-editor-toolbar__group">
        {[1, 2, 3].map(level => (
          <ToolBtn
            key={level}
            title={`Heading ${level}`}
            active={editor.isActive('heading', { level })}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          >
            H{level}
          </ToolBtn>
        ))}
      </div>

      <div className="gc-editor-toolbar__sep" aria-hidden="true" />

      {/* --- Lists --- */}
      <div className="gc-editor-toolbar__group">
        <ToolBtn
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          &#8226;&#8226;
        </ToolBtn>
        <ToolBtn
          title="Ordered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolBtn>
      </div>

      <div className="gc-editor-toolbar__sep" aria-hidden="true" />

      {/* --- Block --- */}
      <div className="gc-editor-toolbar__group">
        <ToolBtn
          title="Blockquote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          &#10077;
        </ToolBtn>
        <ToolBtn
          title="Horizontal rule"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          &#8212;
        </ToolBtn>
      </div>

      <div className="gc-editor-toolbar__sep" aria-hidden="true" />

      {/* --- Media / links --- */}
      <div className="gc-editor-toolbar__group">
        <ToolBtn
          title="Insert / edit link"
          active={editor.isActive('link')}
          onClick={addLink}
        >
          Link
        </ToolBtn>
        <ToolBtn
          title="Insert image from computer"
          onClick={triggerFileInput}
        >
          Img
        </ToolBtn>
        <ToolBtn
          title="Embed YouTube video"
          onClick={addYoutube}
        >
          YT
        </ToolBtn>
      </div>

      {/* Hidden file input for image upload */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}
