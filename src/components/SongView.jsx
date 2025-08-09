import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { transposeChordLine } from '../utils/transpose';
import { useSettings } from '../utils/useSettings';
import { downloadSingleSongPdf } from '../utils/pdf';

export default function SongView({ initialSongs }) {
  const { id } = useParams();
  const [song, setSong] = useState(null);
  const [toKey, setToKey] = useState(null);

  // NEW: collapsible media state (remember per-song)
  const [showMedia, setShowMedia] = useState(false);

  const { settings } = useSettings();

  useEffect(() => {
    const s = initialSongs.find((x) => String(x.id) === String(id));
    if (s) {
      setSong(s);
      setToKey(s.key || 'G');
      // restore user preference per song (default: collapsed)
      try {
        const saved = localStorage.getItem(`mediaOpen:${s.id}`);
        setShowMedia(saved === '1');
      } catch {}
    }
  }, [id, initialSongs]);

  const steps = useMemo(() => computeSteps(song?.key, toKey), [song, toKey]);

  if (!song) {
    return (
      <div className="container">
        <p>
          Song not found. <Link to="/">Back</Link>
        </p>
      </div>
    );
  }

  function toggleMedia() {
    setShowMedia((prev) => {
      const next = !prev;
      try { localStorage.setItem(`mediaOpen:${song.id}`, next ? '1' : '0'); } catch {}
      return next;
    });
  }

  async function handleDownload() {
    try {
      const songInKey = {
        ...song,
        key: toKey,
        lyricsBlocks: song.lyricsBlocks.map((b) => ({
          ...b,
          lines: b.lines.map((l) => ({
            text: l.text,
            chords: transposeChordLine(l.chords || '', steps),
          })),
        })),
      };
      await downloadSingleSongPdf(songInKey, {
        lyricSizePt: settings.lyricFontSizePt,
        chordSizePt: settings.chordFontSizePt,
        columns: settings.columns,
      });
    } catch (e) {
      alert('PDF export failed: ' + (e?.message || e));
      console.error(e);
    }
  }

  const mediaCount = (song.youtube ? 1 : 0) + (song.mp3 ? 1 : 0);

  return (
    <div className="songpage">
      {/* Top header */}
      <div className="songpage__top">
        <Link to="/" className="back">← Back</Link>
        <div className="songpage__titlewrap">
          <div className="song-number">{song.number ? song.number : ''}</div>
          <h1 className="songpage__title">{song.title}</h1>
          <div className="songpage__meta">
            Key: <strong>{song.key || '—'}</strong>
            {song.tags?.length ? <> • {song.tags.join(', ')}</> : null}
          </div>
        </div>
      </div>

      {/* Sticky toolbar */}
      <div className="songpage__toolbar">
        <div className="toolbar__left">
          <label className="toolbar__field">
            Transpose to:
            <select value={toKey} onChange={(e) => setToKey(e.target.value)}>
              {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="toolbar__right">
          <button
            type="button"
            className="btn primary"
            onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); handleDownload(); }}
          >
            Download PDF
          </button>
        </div>
      </div>

      {/* Chord/Lyric sheet */}
      <div
        className="songpage__sheet"
        style={{ columnCount: settings.columns === 'auto' ? undefined : Number(settings.columns) }}
      >
        {song.lyricsBlocks.map((block, bi) => (
          <div key={bi} className="block">
            <div className="section">{block.section}</div>
            {block.lines.map((ln, li) => {
              const key = `${bi}-${li}`;
              const displayChords = transposeChordLine(ln.chords || '', steps);
              return (
                <div key={key} className="linepair">
                  <div className="chords mono" style={{ fontSize: settings.chordFontSizePt }}>
                    {displayChords}
                  </div>
                  <div className="lyrics" style={{ fontSize: settings.lyricFontSizePt }}>
                    {ln.text}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Collapsible media heading + panel (bottom) */}
      {(song.youtube || song.mp3) && (
        <div className="songpage__mediaContainer">
          <button
            type="button"
            className="btn toggle"
            onClick={toggleMedia}
            aria-expanded={showMedia}
            aria-controls="mediaPanel"
          >
            <span className={`chev ${showMedia ? 'open' : ''}`} aria-hidden>▸</span>
            {showMedia ? 'Hide media' : 'Show media'}
            {mediaCount ? ` (${mediaCount})` : ''}
          </button>

          <div
            id="mediaPanel"
            className={`songpage__media ${showMedia ? 'open' : 'closed'}`}
            aria-hidden={!showMedia}
          >
            {song.youtube && (
              <div className="media__card">
                <div className="media__label">Reference Video</div>
                <div className="media__frame">
                  <iframe
                    title="YouTube"
                    src={`https://www.youtube.com/embed/${song.youtube}`}
                    frameBorder="0"
                    allowFullScreen
                  />
                </div>
              </div>
            )}
            {song.mp3 && (
              <div className="media__card">
                <div className="media__label">Audio</div>
                <audio controls src={song.mp3} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function computeSteps(fromKey, toKey) {
  if (!fromKey || !toKey) return 0;
  const SCALE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const norm = k => k && k.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#');
  const a = SCALE.indexOf(norm(fromKey));
  const b = SCALE.indexOf(norm(toKey));
  if (a === -1 || b === -1) return 0;
  return (b - a + 12) % 12;
}
