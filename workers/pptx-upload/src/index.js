/**
 * gracechords-pptx-upload Worker
 *
 * Handles PPTX file uploads and deletions for GraceChords songs.
 * Files are stored in Cloudflare R2 (gracechords-bible bucket, pptx/ prefix).
 *
 * Required secrets (set via `wrangler secret put` before deploying):
 *   SUPABASE_URL              — e.g. https://xyz.supabase.co
 *   SUPABASE_JWT_SECRET       — JWT secret from Supabase dashboard → Settings → API
 *   SUPABASE_SERVICE_ROLE_KEY — service_role key from Supabase dashboard → Settings → API
 *   ALLOWED_ORIGINS           — comma-separated list of allowed frontend origins
 */

const ROLE_HIERARCHY = ['user', 'collaborator', 'editor', 'admin', 'owner']

function isAtLeast(userRole, minRole) {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(minRole)
}

// ---- Base64url helpers (Web Standard, no Node built-ins) ----

function base64urlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '==='.slice((base64.length + 3) % 4)
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---- CORS ----

function getAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

// Returns { allowed, origin } where `allowed` is true iff the request can
// proceed:
//   - no Origin header (non-browser / same-origin) → allowed
//   - Origin in the allowlist → allowed
//   - Origin present but not in allowlist → rejected
function checkOrigin(request, env) {
  const origin = request.headers.get('Origin') || ''
  if (!origin) return { allowed: true, origin: '' }
  return { allowed: getAllowedOrigins(env).includes(origin), origin }
}

function getCorsHeaders(origin) {
  // Vary: Origin is required on every response so a cache that fronts the
  // worker doesn't serve a response with another origin's ACAO.
  const headers = {
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    Vary: 'Origin',
  }
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function addCors(response, corsHeaders) {
  const res = new Response(response.body, response)
  for (const [k, v] of Object.entries(corsHeaders)) {
    res.headers.set(k, v)
  }
  return res
}

// ---- JWT verification + role fetch ----

async function verifyAndGetRole(request, env) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) {
    return { error: 401, msg: 'Missing or malformed Authorization header' }
  }
  const token = auth.slice(7).trim()
  const parts = token.split('.')
  if (parts.length !== 3) {
    return { error: 401, msg: 'Invalid token format' }
  }

  const [headerB64, payloadB64, sigB64] = parts
  const signingInput = `${headerB64}.${payloadB64}`

  // Import HMAC-SHA256 key from the Supabase JWT secret
  const secretBytes = new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
  let key
  try {
    key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
  } catch {
    return { error: 401, msg: 'Token verification setup failed' }
  }

  // Verify signature
  let valid
  try {
    const sigBytes = base64urlDecode(sigB64)
    const dataBytes = new TextEncoder().encode(signingInput)
    valid = await crypto.subtle.verify('HMAC', key, sigBytes, dataBytes)
  } catch {
    return { error: 401, msg: 'Token signature verification failed' }
  }
  if (!valid) {
    return { error: 401, msg: 'Invalid token signature' }
  }

  // Decode payload
  let payload
  try {
    const payloadBytes = base64urlDecode(payloadB64)
    payload = JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch {
    return { error: 401, msg: 'Failed to decode token payload' }
  }

  // Check expiry
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return { error: 401, msg: 'Token expired' }
  }

  const userId = payload.sub
  if (!userId) {
    return { error: 401, msg: 'Token missing sub claim' }
  }

  // Fetch global_role from Supabase
  let userRow
  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/users?select=global_role&id=eq.${encodeURIComponent(userId)}`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    )
    const rows = await resp.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return { error: 403, msg: 'User not found' }
    }
    userRow = rows[0]
  } catch {
    return { error: 500, msg: 'Failed to fetch user role' }
  }

  return { role: userRow.global_role || 'user' }
}

// ---- Handlers ----

async function handleUpload(request, env) {
  const authResult = await verifyAndGetRole(request, env)
  if (authResult.error) {
    return jsonError(authResult.msg, authResult.error)
  }
  if (!isAtLeast(authResult.role, 'collaborator')) {
    return jsonError('Insufficient role: collaborator or higher required', 403)
  }

  // Parse multipart form data
  let formData
  try {
    formData = await request.formData()
  } catch {
    return jsonError('Failed to parse multipart form data', 400)
  }

  const slug = formData.get('slug')
  const file = formData.get('file')

  if (!slug || typeof slug !== 'string') {
    return jsonError('Missing slug field', 400)
  }
  if (!file || typeof file.arrayBuffer !== 'function') {
    return jsonError('Missing file field', 400)
  }

  // Validate slug
  if (!/^[a-z0-9_]+$/.test(slug)) {
    return jsonError('Invalid slug: must match /^[a-z0-9_]+$/', 400)
  }

  // Validate file type
  const validType =
    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  const validExt = typeof file.name === 'string' && file.name.toLowerCase().endsWith('.pptx')
  if (!validType && !validExt) {
    return jsonError('File must be a .pptx (PowerPoint) file', 400)
  }

  // Validate file size (20MB)
  const MAX_BYTES = 20 * 1024 * 1024
  if (file.size > MAX_BYTES) {
    return jsonError('File exceeds 20MB limit', 400)
  }

  // Read the body once and verify the ZIP magic bytes. PPTX is an Office Open
  // XML container (i.e. a ZIP archive) and must start with PK\x03\x04. This
  // catches mislabeled files (renamed .pdf, etc.) that pass the MIME/extension
  // check but aren't actually PPTX.
  let body
  try {
    body = await file.arrayBuffer()
  } catch {
    return jsonError('Failed to read uploaded file', 400)
  }
  if (body.byteLength < 4) {
    return jsonError('File is too small to be a valid PPTX', 400)
  }
  const head = new Uint8Array(body, 0, 4)
  if (head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) {
    return jsonError('File is not a valid PPTX (ZIP) container', 400)
  }

  // Write to R2
  const key = `pptx/${slug}.pptx`
  try {
    await env.R2_BUCKET.put(key, body, {
      httpMetadata: {
        contentType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
    })
  } catch {
    return jsonError('Upload failed', 500)
  }

  // Return public URL using the same pattern as SongView (relative path)
  const url = `/pptx/${slug}.pptx`
  return new Response(JSON.stringify({ url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handleDelete(request, env) {
  const authResult = await verifyAndGetRole(request, env)
  if (authResult.error) {
    return jsonError(authResult.msg, authResult.error)
  }
  if (!isAtLeast(authResult.role, 'editor')) {
    return jsonError('Insufficient role: editor or higher required', 403)
  }

  // Parse JSON body
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Request body must be JSON', 400)
  }

  const { slug } = body
  if (!slug || typeof slug !== 'string') {
    return jsonError('Missing slug field', 400)
  }

  // Validate slug
  if (!/^[a-z0-9_]+$/.test(slug)) {
    return jsonError('Invalid slug: must match /^[a-z0-9_]+$/', 400)
  }

  // Delete from R2 (idempotent — missing key is not an error)
  const key = `pptx/${slug}.pptx`
  try {
    await env.R2_BUCKET.delete(key)
  } catch {
    return jsonError('Delete failed', 500)
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---- Main fetch handler ----

export default {
  async fetch(request, env) {
    const { allowed, origin } = checkOrigin(request, env)
    const corsHeaders = getCorsHeaders(allowed ? origin : '')
    const method = request.method.toUpperCase()
    const url = new URL(request.url)
    const path = url.pathname

    // Handle CORS preflight: still respond with Vary: Origin and either echo
    // the allowed origin or omit ACAO so the browser blocks the request.
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // Reject browser-initiated requests from origins that aren't on the
    // allowlist. Same-origin / non-browser callers (no Origin header) still
    // pass through so curl-style health checks and server-side calls work.
    if (!allowed) {
      return addCors(jsonError('Origin not allowed', 403), corsHeaders)
    }

    let response
    if (method === 'POST' && path === '/upload') {
      response = await handleUpload(request, env)
    } else if (method === 'DELETE' && path === '/delete') {
      response = await handleDelete(request, env)
    } else {
      response = jsonError('Not found', 404)
    }

    return addCors(response, corsHeaders)
  },
}
