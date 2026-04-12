import { useEffect, useState } from 'react'

const BREAKPOINT = 820

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    try { return window.innerWidth <= BREAKPOINT } catch { return false }
  })

  useEffect(() => {
    function onResize() {
      try { setIsMobile(window.innerWidth <= BREAKPOINT) } catch {}
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return isMobile
}
