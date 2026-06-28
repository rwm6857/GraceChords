export type ChordPlacement = { sym: string; index: number };

export type InstrumentalDirective = {
  chords: string[];
  repeat?: number;
};

export type SongLine = {
  lyrics: string;
  chords: ChordPlacement[];
  comment?: string;
  instrumental?: InstrumentalDirective;
};

export type SongSection = {
  kind: string; // e.g., 'verse', 'chorus'
  label?: string;
  lines: SongLine[];
  instrumental?: InstrumentalDirective;
};

export type SongMeta = {
  title?: string;
  key?: string;
  capo?: number;
  meta?: Record<string, string>;
};

export type SongLayoutHints = {
  requestedColumns?: 1 | 2;
  columnBreakAfter?: number[];
};

export type ChordDefine = { name: string; raw: string };

export type SongDoc = {
  meta: SongMeta;
  sections: SongSection[];
  layoutHints?: SongLayoutHints;
  chordDefs?: ChordDefine[];
};
