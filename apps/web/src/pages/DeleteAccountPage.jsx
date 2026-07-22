import React, { useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import deleteAccountMarkdown from '../content/delete-account.md?raw'
import '../styles/posts.css'

// Renders the public Delete Account instructions at /delete-account from the
// markdown source in src/content/. Same marked → DOMPurify → .gc-prose pipeline
// as PrivacyPage/TermsPage. This URL is referenced by the Google Play store
// listing, so it must stay publicly reachable without signing in. Edit the .md
// to update.
export default function DeleteAccountPage() {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(deleteAccountMarkdown, { async: false })),
    []
  )

  return (
    <div className="container gc-post-detail">
      <Helmet>
        <title>Delete Your Account · GraceChords</title>
        <meta name="description" content="How to delete your GraceChords account and the data that is removed." />
      </Helmet>
      <div
        className="gc-post-detail__content gc-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
