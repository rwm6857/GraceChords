/**
 * Cloudflare Pages Function: /bible/[...path]
 *
 * Proxies Bible chapter/manifest requests to the R2 CDN bucket server-side,
 * so the browser never makes a cross-origin request to R2 directly (no CORS needed).
 *
 * Required environment variable (set in Cloudflare Pages → Settings → Environment Variables):
 *   BIBLE_CDN_URL  — the base URL of the R2 bucket, e.g. https://pub-abc123.r2.dev
 *                    (also accepts VITE_BIBLE_CDN_URL for backwards compatibility)
 */
export async function onRequest(context) {
  const { request, env, params } = context

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    })
  }

  const cdnBase = (env.BIBLE_CDN_URL || env.VITE_BIBLE_CDN_URL || '').replace(/\/+$/, '')
  if (!cdnBase) {
    return new Response(
      JSON.stringify({ error: 'Bible CDN not configured. Set BIBLE_CDN_URL in Cloudflare Pages environment variables.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // params.path is an array of decoded path segments after /bible/
  const pathSegments = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : [])
  const filePath = pathSegments.map(encodeURIComponent).join('/')

  const targetUrl = `${cdnBase}/bible/${filePath}`

  let r2Response
  try {
    r2Response = await fetch(targetUrl)
  } catch {
    return new Response(
      JSON.stringify({ error: 'Failed to reach Bible CDN' }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    )
  }

  if (!r2Response.ok) {
    return new Response(r2Response.body, {
      status: r2Response.status,
      headers: {
        'Content-Type': r2Response.headers.get('Content-Type') || 'application/json',
        ...corsHeaders(),
      },
    })
  }

  const contentType = r2Response.headers.get('Content-Type') || 'application/json'

  return new Response(r2Response.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Bible data is static — cache aggressively at the CDN edge and in the browser
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      ...corsHeaders(),
    },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
