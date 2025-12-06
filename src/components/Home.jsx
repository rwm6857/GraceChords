import React from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

const SITE_URL = 'https://gracechords.com'
const OG_IMAGE_URL = `${SITE_URL}/favicon.ico`

export default function Home(){
  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <Helmet>
        <title>GraceChords — Welcome</title>
        <meta name="description" content="GraceChords offers worship chord sheets and lyrics. A refreshed welcome page is coming soon." />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="GraceChords — Welcome" />
        <meta property="og:description" content="GraceChords offers worship chord sheets and lyrics. A refreshed welcome page is coming soon." />
        <meta property="og:url" content={`${SITE_URL}/`} />
        <meta property="og:site_name" content="GraceChords" />
        <meta property="og:image" content={OG_IMAGE_URL} />
        <link rel="canonical" href={`${SITE_URL}/`} />
      </Helmet>
      <h1 style={{ marginBottom: 12 }}>GraceChords</h1>
      <p style={{ maxWidth: 640, lineHeight: 1.6 }}>
        A refreshed welcome page is on the way. In the meantime, you can head to the full song index to browse, search, and build setlists.
      </p>
      <div style={{ marginTop: 20 }}>
        <Link className="btn primary" to="/songs">Browse songs</Link>
      </div>
    </div>
  )
}
