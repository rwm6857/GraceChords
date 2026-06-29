export type LexToken =
  | { type: 'directive'; raw: string }
  | { type: 'lyrics'; raw: string }
  | { type: 'blank' };

export function lexChordPro(input: string): LexToken[] {
  const lines = input.split(/\r?\n/);
  return lines.map((raw) => {
    const t = raw.trim();
    if (t.startsWith('{') && t.endsWith('}')) return { type: 'directive', raw };
    if (t.length === 0) return { type: 'blank' };
    return { type: 'lyrics', raw };
  });
}
