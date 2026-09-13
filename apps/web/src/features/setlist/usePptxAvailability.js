// Which songs in the current set have a PPTX deck in R2, probed with parallel
// HEAD requests through the shared cache so switching sets doesn't re-ask for
// decks already checked this session.
import { useEffect, useState } from 'react'
import { headOk } from '../../utils/network/headCache'
import { publicUrl } from '../../utils/network/publicUrl'
import { catalogSongFor, pptxSlug } from './setlistExport'

export function usePptxAvailability(items, catalog) {
  const [pptxMap, setPptxMap] = useState({})

  useEffect(() => {
    let cancelled = false
    const targets = []
    const seen = new Set()
    for (const item of items) {
      const song = catalogSongFor(item, catalog)
      if (!song) continue
      const slug = pptxSlug(song)
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      targets.push({ slug, url: publicUrl(`pptx/${slug}.pptx`) })
    }

    Promise.all(targets.map(({ slug, url }) => headOk(url, slug).then((ok) => ({ slug, ok }))))
      .then((results) => {
        if (cancelled) return
        const found = {}
        for (const { slug, ok } of results) if (ok) found[slug] = true
        setPptxMap(found)
      })
      .catch(() => {
        if (!cancelled) setPptxMap({})
      })

    return () => {
      cancelled = true
    }
  }, [items, catalog])

  return pptxMap
}
