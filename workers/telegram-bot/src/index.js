// gracechords-telegram-bot — entry point.
// Routes:
//   POST /webhook            — Telegram updates (DM flow)
//   POST /internal/feature       — GitHub Action calls this on merged "post" PRs
//   POST /internal/push          — Pages Function pushes a song/setlist to a linked user
//   POST /internal/report-alert  — Pages Function alerts admin about a reported reflection
//   GET  /healthz                — liveness
// Scheduled: digest cron, Mon + Fri 17:00 ET (see wrangler.toml).

import { verifyTelegramWebhookSecret, verifyInternalBearer } from './auth.js'
import { handleTelegramUpdate } from './webhook.js'
import { runDigest } from './digest.js'
import { postFeature } from './feature.js'
import { pushToUser } from './push.js'
import { sendReportAlert } from './reportAlert.js'

function notFound() {
  return new Response('Not found', { status: 404 })
}

function unauthorized() {
  return new Response('Unauthorized', { status: 401 })
}

function ok(body = 'OK') {
  return new Response(body, { status: 200 })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname === '/healthz') {
      return ok('ok')
    }

    if (url.pathname === '/webhook') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
      if (!verifyTelegramWebhookSecret(request, env)) return unauthorized()
      let update
      try {
        update = await request.json()
      } catch {
        return new Response('Invalid JSON', { status: 400 })
      }
      // Acknowledge fast. All real work happens in the background so Telegram
      // doesn't retry on slow renders.
      ctx.waitUntil(handleTelegramUpdate(env, ctx, update))
      return ok()
    }

    if (url.pathname === '/internal/feature') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
      if (!verifyInternalBearer(request, env)) return unauthorized()
      let body
      try {
        body = await request.json()
      } catch {
        return new Response('Invalid JSON', { status: 400 })
      }
      try {
        await postFeature(env, body)
        return ok()
      } catch (err) {
        return new Response(`Feature post failed: ${err.message || err}`, { status: 500 })
      }
    }

    if (url.pathname === '/internal/push') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
      if (!verifyInternalBearer(request, env)) return unauthorized()
      let body
      try {
        body = await request.json()
      } catch {
        return new Response('Invalid JSON', { status: 400 })
      }
      // Render + send is multi-second; queue it on waitUntil so the Pages
      // Function gets a fast ACK and the user doesn't wait on a spinner.
      ctx.waitUntil(
        pushToUser(env, body).catch(err => {
          console.warn('push failed', err?.message || err)
        })
      )
      return ok()
    }

    if (url.pathname === '/internal/report-alert') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
      if (!verifyInternalBearer(request, env)) return unauthorized()
      let body
      try {
        body = await request.json()
      } catch {
        return new Response('Invalid JSON', { status: 400 })
      }
      // Awaited (a single sendMessage is fast) so the Pages Function's response
      // reflects whether the admin alert actually went out.
      try {
        await sendReportAlert(env, body)
        return ok()
      } catch (err) {
        return new Response(`Report alert failed: ${err.message || err}`, { status: 500 })
      }
    }

    return notFound()
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runDigest(env).catch(err => {
        console.warn('digest failed', err)
      }),
    )
  },
}
