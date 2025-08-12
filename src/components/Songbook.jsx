// src/components/Songbook.jsx
import { useMemo, useState } from "react";
import catalog from "../data/index.json";
import * as pdf from "../utils/pdf"; // use whichever exporter exists

// ---- helpers ----
function slugFromFile(file) {
  return file ? file.replace(/\.chordpro$/i, "") : "";
}
function slugFromTitle(title) {
  return (title || "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function getSlug(entry) {
  return slugFromFile(entry?.file) || entry?.id || slugFromTitle(entry?.title || "");
}
function byTitle(a, b) {
  return (a?.title || "").localeCompare(b?.title || "", undefined, { sensitivity: "base" });
}
function uniqSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
  );
}

export default function Songbook() {
  // -------- filters/search ----------
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("All");
  const [country, setCountry] = useState("All");
  const [author, setAuthor] = useState("All");

  const tags = useMemo(
    () => uniqSorted(catalog.flatMap((s) => (Array.isArray(s.tags) ? s.tags : s.tags ? [s.tags] : []))),
    []
  );
  const countries = useMemo(() => uniqSorted(catalog.map((s) => s.country).filter(Boolean)), []);
  const authors = useMemo(() => {
    const arr = catalog.flatMap((s) =>
      Array.isArray(s.authors) ? s.authors : s.authors ? [s.authors] : []
    );
    return uniqSorted(arr);
  }, []);

  const filteredSongs = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = catalog.slice();
    if (q) {
      arr = arr.filter((s) => {
        const title = (s.title || "").toLowerCase();
        const auth = (Array.isArray(s.authors) ? s.authors.join(", ") : s.authors || "")
          .toLowerCase();
        return title.includes(q) || auth.includes(q);
      });
    }
    if (tag !== "All") {
      arr = arr.filter((s) =>
        Array.isArray(s.tags) ? s.tags.includes(tag) : s.tags === tag
      );
    }
    if (country !== "All") {
      arr = arr.filter((s) => s.country === country);
    }
    if (author !== "All") {
      arr = arr.filter((s) =>
        Array.isArray(s.authors) ? s.authors.includes(author) : s.authors === author
      );
    }
    return arr.sort(byTitle);
  }, [search, tag, country, author]);

  // -------- selection ----------
  const [selected, setSelected] = useState(() => new Set());
  const selectedEntries = useMemo(() => {
    const bySlug = new Map(catalog.map((s) => [getSlug(s), s]));
    return [...selected]
      .map((slug) => bySlug.get(slug))
      .filter(Boolean)
      .sort(byTitle);
  }, [selected]);

  const filteredCount = filteredSongs.length;
  const selectedCount = selected.size;

  function toggleOne(slug, checked) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }
  function selectAllFiltered() {
    if (!filteredSongs.length) return;
    const add = filteredSongs.map(getSlug);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of add) next.add(s);
      return next;
    });
  }
  function clearAll() {
    setSelected(new Set());
  }

  // -------- export ----------
  const [includeToc, setIncludeToc] = useState(true);
  const [coverDataUrl, setCoverDataUrl] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (!selectedEntries.length) return;
    try {
      setBusy(true);
      const exporter = pdf.downloadSongbookPdf || pdf.downloadMultiSongPdf;
      await Promise.resolve(
        exporter(selectedEntries, {
          includeToc,
          coverImageDataUrl: coverDataUrl || undefined,
          title: "Songbook",
          sort: "title",
          numbering: "alphabetical",
          mode: "songbook", // hint for downloadMultiSongPdf if used
        })
      );
    } finally {
      setBusy(false);
    }
  }

  function onCoverFile(e) {
    const file = e.target.files?.[0];
    if (!file) {
      setCoverDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCoverDataUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  // -------- render ----------
  return (
    <div className="SongbookPage">
      {/* LEFT: Picker */}
      <section className="SongPicker">
        <div className="SongPickerHeader">
          <div className="Row" style={{ gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="Field" style={{ minWidth: 220 }}>
              <label htmlFor="sb-search">Search:</label>
              <input
                id="sb-search"
                type="search"
                placeholder="Title or author"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div className="Field">
              <label htmlFor="sb-tag">Tag:</label>
              <select id="sb-tag" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option>All</option>
                {tags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="Field">
              <label htmlFor="sb-country">Country:</label>
              <select id="sb-country" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option>All</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="Field">
              <label htmlFor="sb-author">Author:</label>
              <select id="sb-author" value={author} onChange={(e) => setAuthor(e.target.value)}>
                <option>All</option>
                {authors.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className="Field" style={{ marginLeft: "auto", gap: ".5rem" }}>
              <button className="Button" onClick={selectAllFiltered} disabled={!filteredCount}>
                Select all ({filteredCount} filtered)
              </button>
              <button className="Button" onClick={clearAll} disabled={!selectedCount}>
                Clear
              </button>
            </div>
          </div>

          <div className="Row Small" style={{ marginTop: ".5rem" }}>
            <strong>{selectedCount}</strong> selected
          </div>
          <div className="Hr" />
        </div>

        {/* Only this section scrolls; two-column grid handled by your CSS */}
        <div className="SongPickerScroll" role="region" aria-label="Song list">
          <div className="SongGrid">
            {filteredSongs.map((s) => {
              const slug = getSlug(s);
              const checked = selected.has(slug);
              const auth =
                Array.isArray(s.authors) && s.authors.length
                  ? s.authors.join(", ")
                  : s.authors || "";
              const tagLine =
                Array.isArray(s.tags) && s.tags.length ? s.tags.join(", ") : s.tags || "";

              return (
                <label key={slug} className="SongCard">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleOne(slug, e.target.checked)}
                    aria-label={`Select ${s.title}`}
                  />
                  <div className="SongInfo">
                    <div className="SongTitle">{s.title}</div>
                    <div className="SongMeta">
                      {auth ? auth : "—"}
                      {tagLine ? ` • ${tagLine}` : ""}
                      {s.country ? ` • ${s.country}` : ""}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      {/* RIGHT: Preview / Export */}
      <aside className="SongPreview">
        <div className="Row" style={{ justifyContent: "space-between" }}>
          <div className="Field">
            <input
              id="sb-toc"
              type="checkbox"
              checked={includeToc}
              onChange={(e) => setIncludeToc(e.target.checked)}
            />
            <label htmlFor="sb-toc">Include table of contents</label>
          </div>

          <div className="Field">
            <label htmlFor="sb-cover">Cover page (image):</label>
            <input
              id="sb-cover"
              className="CoverInput"
              type="file"
              accept="image/*"
              onChange={onCoverFile}
            />
          </div>

          <div className="Field" style={{ marginLeft: "auto" }}>
            <button
              className="Button"
              onClick={handleExport}
              disabled={!selectedEntries.length || busy}
              title={!selectedEntries.length ? "Select some songs first" : "Export PDF"}
            >
              {busy ? "Exporting…" : `Export PDF (${selectedEntries.length})`}
            </button>
          </div>
        </div>

        <div className="Hr" />

        <div className="PreviewScroll">
          <ol className="List" style={{ listStyle: "decimal inside" }}>
            {selectedEntries.map((s) => (
              <li key={getSlug(s)}>
                {s.title}
                {s.authors?.length ? (
                  <span className="Small">
                    {" "}
                    — {Array.isArray(s.authors) ? s.authors.join(", ") : s.authors}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
