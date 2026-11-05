// Ask Cloudinary to serve an uploaded image in the browser's best format
// (AVIF/WebP), at automatic quality, no wider than `width` (never upscaled).
// Only plain upload URLs are rewritten: one that already carries a
// transformation, or isn't a Cloudinary URL at all, is returned unchanged.
const PLAIN_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)((?:v\d+\/)?[^/,]+(?:\/[^,]+)?)$/

export function cloudinaryUrl(url, width) {
  const m = typeof url === 'string' && url.match(PLAIN_UPLOAD)
  if (!m || /^[a-z]{1,3}_/.test(m[2])) return url
  return `${m[1]}f_auto,q_auto,c_limit,w_${width}/${m[2]}`
}
