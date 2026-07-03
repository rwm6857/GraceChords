import React, { useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import privacyMarkdown from '../content/privacy-policy.md?raw'
import '../styles/posts.css'

// Renders the hosted Privacy Policy at /privacy from the final markdown source in
// src/content/. Markdown → HTML via marked, sanitized with DOMPurify (same path as
// PostDetailPage), styled with the shared .gc-prose rules. Edit the .md to update.
export default function PrivacyPage() {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(privacyMarkdown, { async: false })),
    []
  )

  return (
    <div className="container gc-post-detail">
      <Helmet>
        <title>Privacy Policy · GraceChords</title>
        <meta name="description" content="How GraceChords handles your data and privacy." />
      </Helmet>
      <div
        className="gc-post-detail__content gc-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
