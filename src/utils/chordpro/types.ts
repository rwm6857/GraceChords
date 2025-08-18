export type ChordPlacement = { sym: string; index: number };
export type SongLine = { lyrics: string; chords: ChordPlacement[] };

export type SongSection = {
  kind: string; // e.g., 'verse', 'chorus'
  label?: string;
  lines: SongLine[];
};

export type SongMeta = {
  title?: string;
  key?: string;
  meta?: Record<string, string>;
};

export type SongDoc = {
  meta: SongMeta;
  sections: SongSection[];
};
