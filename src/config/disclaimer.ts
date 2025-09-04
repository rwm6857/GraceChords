export const isDisclaimerEnabled = () => (import.meta?.env?.VITE_ENABLE_DISCLAIMER !== '0');

function contactSuffix() {
  const email = (import.meta?.env?.VITE_CONTACT_EMAIL || import.meta?.env?.VITE_CONTACT || '').trim();
  return email ? ` Contact: ${email}` : '';
}

export function getSiteDisclaimer(): string {
  return (
    'All lyrics and music are the property of their respective owners. ' +
    'GraceChords provides tools for personal worship and educational use only. ' +
    'Do not repost or redistribute copyrighted lyrics/charts. ' +
    'Rights holders: contact us for takedown requests.' +
    contactSuffix()
  );
}

export function getChordproCommentBlock(): string {
  const lines = [
    '# --- DISCLAIMER (GraceChords) ---',
    '# All lyrics and music are the property of their respective owners. GraceChords provides tools for personal worship and educational use only. Do not repost or redistribute copyrighted lyrics/charts. Rights holders: contact us for takedown requests.' + contactSuffix(),
    '# --- END DISCLAIMER ---',
    ''
  ];
  return lines.join('\n');
}

export function getPdfFooterDisclaimer(): string {
  return 'All lyrics and music are the property of their respective owners. For personal worship and educational use only.';
}

