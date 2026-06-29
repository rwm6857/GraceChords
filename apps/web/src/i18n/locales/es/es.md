# GraceChords Glossary — `es`

Locked-in terminology and convention decisions for the Spanish locale. Future revisions and translators should follow these unless Ryan explicitly changes them.

**Locale:** `es`
**Last updated:** 2026-05-03
**Reviewer:** Ryan

## Brand and product names

| English | Spanish | Note |
|---|---|---|
| GraceChords | GraceChords | Brand — never translate |
| Worship Mode | Modo adoración | |
| Song of the Day | Canción del día | |
| Daily Word | Palabra del día | **Kept as native term** — universally used by Spanish-language Bible apps and church sites for daily devotional. Same outcome as Korean. Don't relocalize. |
| Quiet Time | Tiempo a solas | "Tiempo a solas con Dios" is also valid; short form widely understood in evangelical context |
| High Energy Hit | Éxito de alta energía | Acceptable but slightly stilted; flagged for possible future revision |
| Celebration Set | Set de celebración | "Set" as anglicism is acceptable in Spanish worship-music vernacular |
| Build a 3-Song Flow | Flujo de 3 canciones | Verb dropped — matches the noun pattern of every other action title; closer to English length |
| Random Theme Set | Set de tema aleatorio | |
| Random 10-Song Collection | Colección aleatoria de 10 canciones | |
| "Send Me" Songbook | Cancionero "Envíame" | Isaiah 6:8 reference; Reina-Valera renders as "Heme aquí, envíame a mí" but "Envíame" alone is concise and recognizable |
| GraceChords Songbook | Cancionero GraceChords | |
| Contribute | Contribuir | Infinitive, matches button-voice convention |
| Song Library | Biblioteca de canciones | |
| Setlist Builder | Creador de repertorios | "Repertorio" is the established term for setlist |
| Songbook Tool | Herramienta de cancionero | |
| Editor Portal | Portal del editor | Person-based |
| Admin Portal | Portal del administrador | Person-based, parallel to editor portal — **not** "Portal de administración" |

## Worship and ministry vocabulary

| English | Spanish | Note |
|---|---|---|
| God | Dios | |
| Holy Spirit / Spirit | Espíritu Santo / el Espíritu | Capitalize when referring to the Holy Spirit |
| Word / Word of God | la Palabra / la Palabra de Dios | **Capitalize "Palabra"** when referring to Scripture — established convention in Spanish Christian writing. Lowercase reads as a generic "word" |
| Bible | Biblia | |
| Bible verse | versículo bíblico | |
| Worship | adoración | |
| Praise | alabanza | |
| Worshipper | adorador | |
| Setlist / Repertoire | repertorio | |
| Set (curated bundle) | set | Anglicism, acceptable in Spanish worship-music vernacular |
| Songbook | cancionero | |
| Hymn | himno | |
| Cross | Cruz | |
| Missions | Misiones | |
| Commitment / Dedication | Compromiso | |
| Sheet music vs. chord chart | partitura vs. canciones con acordes / cifras | Use **canciones con acordes** or **cifras**. "Partitura" implies full sheet music notation, not chord+lyric sheets |

## UI conventions

| Pattern | Decision |
|---|---|
| Tú vs. usted | **Tú throughout** — matches source's warm/informal tone |
| Button voice | Infinitive (`Guardar`, `Cancelar`, `Iniciar sesión`) for buttons; imperative (`Inicia sesión`, `Crea tu cuenta`) for instructional headings |
| Loading state | `~ando…` / `~iendo…` form (`Cargando…`, `Iniciando sesión…`, `Creando cuenta…`). Always U+2026 ellipsis |
| Toggle vs. switch | **Alternar** for "toggle" (`Alternar acordes`, `Alternar modo oscuro`); **Cambiar a** for "switch to" (`Cambiar a modo claro`) |
| "Please" in errors | **Drop "Por favor"** at the start of error messages. Spanish UI conveys politeness through the friendly imperative form (`Inténtalo de nuevo` not `Por favor, inténtalo de nuevo`). Stacking "Por favor" before consecutive errors feels overly formal |
| Length | Spanish runs longer than English by default. Trim padding (drop unnecessary verbs, articles, "Por favor") to keep UI parity |

## Spain vs. Latin America

This locale uses `es` (no region qualifier), targeting both regions. Decisions:

| Pattern | Use | Avoid | Why |
|---|---|---|---|
| "We sent…" | **Te enviamos** | Hemos enviado | LatAm preferred form; works in both regions. Spain-only `pretérito perfecto compuesto` reads odd to Latin American users |
| "Press Enter" | Pulsa / Presiona | — | Both understood. Currently uses `Pulsa` (Spain-leaning); not flagged for change |
| Move to / Switch to | Cambiar a | — | Universal |
| Mobile | móvil | celular | Tech context; "móvil" is universally understood in tech UIs even in LatAm |

If Ryan later wants to fork into `es-ES` and `es-MX` (or similar), this locale should lean LatAm-friendly because that's where most US-based Spanish-speaking churchgoers come from.

## Word-choice preferences

| Concept | Use | Avoid | Why |
|---|---|---|---|
| "Word" (Scripture) | **la Palabra** (capital P) | la palabra (lowercase) | Capitalization signals Scripture in Spanish Christian writing |
| Toggle | **Alternar** | Cambiar | Cambiar = "change"; Alternar = "alternate/toggle." Use the former for switching values, the latter for binary toggles |
| Charts (worship) | **canciones con acordes** / **cifras** | partituras | Partituras = sheet music with notation, not chord/lyric sheets |

## Decisions worth preserving

- **`nav.dailyWord` stays "Palabra del día"** — established native phrase. Don't relocalize like Turkish (which changed to "Kutsal Kitap").
- **`home.actions.threeSongFlow.title` dropped its verb** ("Crea un flujo…" → "Flujo de 3 canciones"). Matches the noun pattern used by every other action title in the file. Same principle as the Turkish revision.
- **Six "Por favor," removals** across `auth.errors` and `errors.json`. The source English has "Please" but Spanish UI conventions don't stack "Por favor" before every imperative the way English does. Politeness is in the imperative form already.
- **`Portal del administrador` parallel to `Portal del editor`** — both person-based, consistent.

## Items currently flagged for human review

- **`auth.welcomeBack` and `auth.welcomeToast`** — both use masculine `Bienvenido` as the generic. Inclusive options exist (`Te damos la bienvenida`, `Bienvenido/a`) but this is a brand voice / audience call, not a correctness issue. Christian audiences vary on this. Not changed in this pass.
- **`auth.email`** — "Correo electrónico" (18 chars) is significantly longer than English "Email" (5 chars), pushes form labels around. Modern alternatives: "Correo" (compact) or "Email" (anglicism). Acceptable as-is; flag for possible future revision if UI fit becomes an issue.
- **`auth.displayName`** — "Nombre para mostrar" is a Microsoft-style literal calque. "Nombre visible" is shorter and equally clear. Not changed.
- **`home.actions.highEnergy.title`** — "Éxito de alta energía" is literal and slightly stilted. Alternatives: "Alabanza enérgica," "Alabanza con fuerza." Not changed; the literal form matches source's pop-music register but isn't the most idiomatic Spanish.
- **`home.searchHelper`** — "Pulsa Enter" is Spain Spanish; LatAm uses "Presiona Enter." Both understood; not changed in this pass.
