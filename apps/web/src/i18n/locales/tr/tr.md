# GraceChords Glossary — `tr`

Locked-in terminology and convention decisions for the Turkish locale. Future revisions and translators should follow these unless Ryan explicitly changes them.

**Locale:** `tr`
**Last updated:** 2026-05-03
**Reviewer:** Ryan

## Brand and product names

| English | Turkish | Note |
|---|---|---|
| GraceChords | GraceChords | Brand — never translate |
| Worship Mode | Tapınma Modu | |
| Song of the Day | Günün İlahisi | |
| Daily Word | Kutsal Kitap | Deliberate localization — nav link points to a daily verse feature; "Kutsal Kitap" reads more universally than a literal "Günün Sözü" |
| Quiet Time | Sessiz Zaman | Established in Turkish evangelical circles |
| High Energy Hit | Coşkulu İlahi | |
| Celebration Set | Kutlama Seti | |
| Build a 3-Song Flow | 3 İlahilik Akış | Imperative dropped — natural in Turkish, mirrors EN length |
| Random Theme Set | Rastgele Tema Seti | |
| Random 10-Song Collection | Rastgele 10 İlahilik Koleksiyon | |
| "Send Me" Songbook | "Beni Gönder" İlahi Kitabı | Isaiah 6:8 reference |
| GraceChords Songbook | GraceChords İlahi Kitabı | |
| Song Library | İlahi Kütüphanesi | |
| Setlist Builder | Set Listesi Oluşturucu | |
| Songbook Tool | İlahi Kitabı Aracı | |
| Editor Portal | Editör Portalı | |
| Admin Portal | Yönetici Portalı | |

## Worship and ministry vocabulary

| English | Turkish | Note |
|---|---|---|
| God | Tanrı | Standard in Turkish Protestant Bibles (Kutsal Kitap Yeni Çeviri). Do **not** use "Allah" |
| Spirit / Holy Spirit | Ruh / Kutsal Ruh | Capitalize Ruh when referring to the Holy Spirit. Use "Kutsal Ruh" if context needs disambiguation |
| Word of God | Tanrı'nın Sözü / Tanrı'nın Sözüyle | Possessive form. Apply instrumental `-yle` when "with the Word" |
| Bible | Kutsal Kitap | Full Bible (OT + NT). Do **not** use "İncil" — that means Gospel/NT only |
| Bible verse | Kutsal Kitap ayeti | |
| Worship | Tapınma | Active devotional sense |
| Praise | Övgü | |
| Setlist | Set Listesi | |
| Songbook | İlahi Kitabı | |
| Hymn / worship song | İlahi | |
| Service (church) | İbadet | |
| Missions | Misyon | |

## UI conventions

| Pattern | Decision |
|---|---|
| Formal vs. informal "you" | Standard UI convention: formal **siz** for sentences (`Hesabınıza giriş yapın`, `Lütfen tekrar deneyin`), bare imperatives for buttons (`Kaydet`, `Sil`, `Giriş yap`). Matches Microsoft / Google / mainstream Turkish SaaS. |
| Button voice | Bare imperative (`Kaydet`, not `Kaydetmek` or `Kaydedin`) |
| Loading ellipsis | `…` (U+2026) |
| Quote style | Curly `"…"` matching source |
| Title-case vs. sentence-case | Match source: sentence-case for prose, but Turkish convention often title-cases multi-word feature names (`İlahi Kütüphanesi`, `Set Listesi Oluşturucu`). Acceptable. |
| Numerals in UI | Prefer numerals over words when source uses them (`İki sütun` mirrors `Use 2 columns`) |
| String length | Match source length closely. Drop verbs that aren't natural in Turkish rather than padding to mirror English structure. |

## Word-choice preferences

| Concept | Use | Avoid |
|---|---|---|
| Password | **şifre** | parola (technically equivalent but not preferred) |
| Two columns | **İki sütun** | Çift sütun (means "double/paired," ambiguous) |

## Decisions worth preserving

- **`nav.dailyWord` → "Kutsal Kitap"** (not literal "Günün Sözü"). This nav link routes to a daily verse feature; the broader term reads more naturally to Turkish-speaking churchgoers and avoids implying it's a single rotating quote.
- **"Spirit" stays as "Ruh" (capitalized)** in `home.actions.threeSongFlow.desc` rather than expanding to "Kutsal Ruh." Capitalization carries the meaning; the shorter form fits the UI.
- **Imperative verb dropped** from `home.actions.threeSongFlow.title` ("Build a 3-Song Flow" → "3 İlahilik Akış"). Adding `Oluşturun` would push the string ~30% longer than English with no readability gain.

## Items currently flagged for human review

- `home.tools.songLibrary.desc` — uses "İbadet notalarını" (sheet music). For chord charts (lead sheets), "akor şemaları" or "akor sayfaları" is more accurate. Not changed in this pass; flag for next review.
- `common.toggleDarkMode` — "Koyu temayı değiştir" reads as "change the dark theme" (ambiguous). Consider `Koyu temayı aç/kapat` (toggle on/off) or `Tema değiştir` (switch theme). Not changed in this pass.
