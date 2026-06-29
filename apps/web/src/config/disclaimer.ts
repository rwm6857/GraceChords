export const isDisclaimerEnabled = () => (import.meta?.env?.VITE_ENABLE_DISCLAIMER !== '0');
export const DISCLAIMER_EMAIL = 'ryan@gracechords.com'

export function getSiteDisclaimer(): string {
  return (
    'All lyrics are property of their respective owners. ' +
    'GraceChords provides tools for personal and educational use only. ' +
    'Rights holders, email us for takedown requests.'
  );
}

export function getChordproCommentBlock(): string {
  const lines = [
    '# --- DISCLAIMER (GraceChords) ---',
    '# All lyrics and music are the property of their respective owners. GraceChords provides tools for personal worship and educational use only. Do not repost or redistribute copyrighted lyrics/charts. Rights holder, email us for takedown requests.',
    '# --- END DISCLAIMER ---',
    ''
  ];
  return lines.join('\n');
}

export function getPdfFooterDisclaimer(): string {
  return 'All lyrics and music are the property of their respective owners. For personal worship and educational use only.';
}
