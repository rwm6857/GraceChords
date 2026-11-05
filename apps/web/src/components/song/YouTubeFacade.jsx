import React, { useState } from 'react'
import { PlayIcon } from '../Icons'

// A YouTube iframe pulls ~900 KiB of player JS/CSS and third-party cookies the
// moment it renders. Show the video's thumbnail instead and only mount the
// player (privacy-enhanced domain, autoplaying) once the user asks for it.
// `videoId` must already be validated (11 chars of [A-Za-z0-9_-]).
export default function YouTubeFacade({ videoId, title }) {
  const [active, setActive] = useState(false)

  if (active) {
    return (
      <iframe
        title={title}
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    )
  }

  return (
    <button
      type="button"
      className="media__facade"
      onClick={() => setActive(true)}
      aria-label={title}
    >
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        width="480"
        height="360"
        loading="lazy"
        decoding="async"
      />
      <span className="media__play" aria-hidden="true">
        <PlayIcon size={28} />
      </span>
    </button>
  )
}
