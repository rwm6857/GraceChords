#!/usr/bin/env node
// Generate the client secret Supabase needs for "Sign in with Apple" on the web.
//
// Apple does not issue a static secret: it is an ES256-signed JWT made from a
// Sign in with Apple key (.p8), and Apple caps its lifetime at 6 months. When it
// expires, web Apple sign-in and linking stop working (native iOS sign-in does
// not use it). The rotate-apple-secret workflow runs this monthly and pushes
// the result to Supabase; run it by hand only to set things up or recover —
// see the wiki's Production-Readiness page, "Sign-in providers and account
// security".
//
// Usage:
//   node apps/web/scripts/apple-client-secret.mjs \
//     --team J7Y8NYZ48Q --key-id ABC123DEFG --services-id com.gracechords.web \
//     --p8 ~/Downloads/AuthKey_ABC123DEFG.p8
//
// The .p8 is a private key: never commit it. Nothing is written to disk; the JWT
// goes to stdout and its expiry to stderr.
//
// Instead of --p8 <path>, the key's contents can come from the APPLE_P8
// environment variable. The rotate-apple-secret workflow uses this so the key
// never touches the runner's disk.
import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const MAX_DAYS = 180

const { values } = parseArgs({
  options: {
    team: { type: 'string' },
    'key-id': { type: 'string' },
    'services-id': { type: 'string' },
    p8: { type: 'string' },
    days: { type: 'string', default: String(MAX_DAYS) },
  },
})

const p8FromEnv = process.env.APPLE_P8?.trim()
const missing = ['team', 'key-id', 'services-id', ...(p8FromEnv ? [] : ['p8'])].filter((k) => !values[k])
if (missing.length) {
  console.error(`Missing: ${missing.map((k) => `--${k}`).join(', ')}`)
  console.error('Usage: apple-client-secret.mjs --team <TEAM_ID> --key-id <KEY_ID> --services-id <SERVICES_ID> --p8 <path>')
  console.error('       (or set APPLE_P8 to the key contents instead of --p8)')
  process.exit(1)
}

const days = Number(values.days)
if (!Number.isFinite(days) || days <= 0 || days > MAX_DAYS) {
  console.error(`--days must be between 1 and ${MAX_DAYS} (Apple's limit is 6 months)`)
  process.exit(1)
}

const b64url = (data) => Buffer.from(data).toString('base64url')

const now = Math.floor(Date.now() / 1000)
const exp = now + Math.floor(days * 86400)
const header = { alg: 'ES256', kid: values['key-id'], typ: 'JWT' }
const payload = {
  iss: values.team,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: values['services-id'],
}

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
const key = createPrivateKey(values.p8 ? readFileSync(values.p8, 'utf8') : p8FromEnv)
// JWS ES256 wants the raw r||s signature, not DER.
const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' })

process.stdout.write(`${signingInput}.${b64url(signature)}\n`)
console.error(`Expires ${new Date(exp * 1000).toISOString()} — set a reminder to rotate before then.`)
