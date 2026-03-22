/**
 * Cloudflare Pages Function: /pptx/[...path]
 *
 * Proxies PPTX file requests to the R2 CDN bucket server-side,
 * so the browser never makes a cross-origin request to R2 directly (no CORS needed).
 * This also enables programmatic fetch() calls from the app (combine/bundle exports).
 *
 * No additional environment variables needed — PPTX files share the same R2 bucket as
 * Bible files, so this function reuses the existing BIBLE_CDN_URL (or VITE_BIBLE_CDN_URL)
 * variable already set in Cloudflare Pages → Settings → Environment Variables.
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

  // Only allow GET and HEAD
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: corsHeaders() })
  }

  const cdnBase = (env.BIBLE_CDN_URL || env.VITE_BIBLE_CDN_URL || '').replace(/\/+$/, '')

  if (!cdnBase) {
    return new Response(
      JSON.stringify({ error: 'PPTX CDN not configured. Set BIBLE_CDN_URL in Cloudflare Pages environment variables.' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    )
  }

  // params.path is an array of decoded path segments after /pptx/
  const pathSegments = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : [])
  const filePath = pathSegments.map(encodeURIComponent).join('/')

  const targetUrl = `${cdnBase}/pptx/${filePath}`

  let r2Response
  try {
    r2Response = await fetch(targetUrl, { method: request.method })
  } catch {
    return new Response(
      JSON.stringify({ error: 'Failed to reach PPTX CDN' }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    )
  }

  if (!r2Response.ok) {
    return new Response(r2Response.body, {
      status: r2Response.status,
      headers: {
        'Content-Type': r2Response.headers.get('Content-Type') || 'application/octet-stream',
        ...corsHeaders(),
      },
    })
  }

  const contentType =
    r2Response.headers.get('Content-Type') ||
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'

  const responseHeaders = {
    'Content-Type': contentType,
    // Allow CDN/browser caching — PPTX files change only on explicit upload
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    ...corsHeaders(),
  }

  const contentLength = r2Response.headers.get('Content-Length')
  if (contentLength) responseHeaders['Content-Length'] = contentLength

  // For HEAD requests return headers only (no body)
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers: responseHeaders })
  }

  return new Response(r2Response.body, {
    status: 200,
    headers: responseHeaders,
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
