import React, { useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import termsMarkdown from '../content/terms-of-use.md?raw'
import '../styles/posts.css'

// Renders the hosted Terms of Use at /terms from the final markdown source in
// src/content/. Same markdown → HTML (marked) → sanitize (DOMPurify) → .gc-prose
// pipeline as PrivacyPage. Edit the .md to update.
export default function TermsPage() {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(termsMarkdown, { async: false })),
    []
  )

  return (
    <div className="container gc-post-detail">
      <Helmet>
        <title>Terms of Use · GraceChords</title>
        <meta name="description" content="The terms governing use of GraceChords." />
      </Helmet>
      <div
        className="gc-post-detail__content gc-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
