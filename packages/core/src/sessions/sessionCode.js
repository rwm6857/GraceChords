// Fresh per-session share code generator.
//
// A session code is created fresh for every live session (its existence == the
// session is live) and must be short + human-friendly for a shared link. This is
// deliberately NOT the deterministic setcode.js hash — that encodes a setlist's
// contents and would collide across identical setlists; session codes must be
// unique per session, enforced by the sessions.code UNIQUE constraint with
// insert-retry on collision (see sessionsRepo.createSession).

// Unambiguous alphabet: no 0/O, 1/I/L to avoid transcription errors when a code
// is read aloud or typed from a screen.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const DEFAULT_LENGTH = 6

/**
 * Generate a random session code from the unambiguous alphabet.
 * @param {number} [length=6]
 * @returns {string}
 */
export function generateSessionCode(length = DEFAULT_LENGTH) {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}
