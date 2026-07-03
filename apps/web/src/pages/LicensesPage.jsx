import React, { useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import thirdPartyNotices from '../content/third-party-licenses.md?raw'
import '../styles/posts.css'

// Renders /licenses. Composes a hand-authored preamble (intro + a Scripture-text
// attribution placeholder) with the generated third-party dependency notices
// (src/content/third-party-licenses.md, produced by `npm run generate:licenses`).
// Keeping the preamble here — not in the generated file — means regenerating the
// notices never disturbs the Scripture section. Same marked → DOMPurify →
// .gc-prose pipeline as the Privacy/Terms pages.
const PREAMBLE = `# Acknowledgements & Licenses

GraceChords is free, non-commercial worship software. This page lists the
third-party open-source components it is built with, along with attribution for
the Scripture texts it uses.

## Scripture Text

Scripture translation credits — to be added.

`

export default function LicensesPage() {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(PREAMBLE + thirdPartyNotices, { async: false })),
    []
  )

  return (
    <div className="container gc-post-detail">
      <Helmet>
        <title>Acknowledgements &amp; Licenses · GraceChords</title>
        <meta
          name="description"
          content="Open-source components and Scripture attributions used by GraceChords."
        />
      </Helmet>
      <div
        className="gc-post-detail__content gc-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
