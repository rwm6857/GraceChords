// Part 1 (in-app acceptance gate) copy for Shared Reflections, supplied by the
// maintainer from the Terms of Use. Kept as a constant (not i18n) because it is
// legal EULA text shown in English — the same content lives in the web Terms of
// Use (gracechords.com/terms), which the gate links to. Structural labels
// (title, buttons, link) DO go through i18n; only this body copy is fixed.

export const UGC_GATE_INTRO =
  'When you share a reflection publicly, it appears anonymously to other GraceChords users alongside today’s reading — your name and email are never shown. Public reflections are visible to others only on the day they’re posted.'

export const UGC_GATE_SUBHEAD = 'Please help keep this a place of encouragement:'

export const UGC_GATE_RULES: readonly string[] = [
  'Share your own words — a reflection, prayer, or encouragement rooted in today’s passage.',
  'Be kind. No harassment, hate, threats, or attacks on others.',
  'Keep it clean. No sexual, violent, or otherwise objectionable content.',
  'No spam, advertising, links, or pretending to be someone else.',
  'Don’t share private information — your own or anyone else’s.',
]

export const UGC_GATE_ENFORCEMENT =
  'Reflections are automatically screened before they post, and anyone can report a reflection. We remove content that breaks these rules and may permanently block anyone who posts it — normally within 24 hours of a report.'

// Shown just above the buttons; the "Terms of Use" words are rendered as a link.
export const UGC_GATE_CONFIRM_PREFIX =
  'By sharing publicly, you confirm this reflection is your own, you’re responsible for it, and you agree to these rules and our '

export const TERMS_URL = 'https://gracechords.com/terms'
