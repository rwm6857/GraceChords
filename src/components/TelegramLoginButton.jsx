import { useEffect, useRef } from 'react'

// Renders the official Telegram Login Widget. The bot username is hardcoded
// because (a) it's not a secret and (b) the widget script reads `data-`
// attributes set on its own <script> tag, so a single component instance is
// enough — no need to thread it through env vars.
const BOT_USERNAME = 'gracechords_bot'

// Telegram's widget injects a global callback (named by data-onauth) and
// calls it with the auth payload. We assign a unique name per mount so two
// instances on the same page don't collide.
let callbackCounter = 0

export default function TelegramLoginButton({ onAuth, disabled = false }) {
  const containerRef = useRef(null)
  const callbackNameRef = useRef(`__gcTelegramAuth${++callbackCounter}`)

  useEffect(() => {
    if (disabled) return
    const container = containerRef.current
    if (!container) return

    const callbackName = callbackNameRef.current
    window[callbackName] = (user) => {
      try { onAuth?.(user) } catch (err) { console.error('Telegram auth handler threw', err) }
    }

    const script = document.createElement('script')
    script.async = true
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', BOT_USERNAME)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-userpic', 'false')
    script.setAttribute('data-onauth', `${callbackName}(user)`)
    script.setAttribute('data-request-access', 'write')

    container.appendChild(script)

    return () => {
      try { delete window[callbackName] } catch { window[callbackName] = undefined }
      while (container.firstChild) container.removeChild(container.firstChild)
    }
  }, [onAuth, disabled])

  return <div ref={containerRef} aria-label="Telegram login widget" />
}
