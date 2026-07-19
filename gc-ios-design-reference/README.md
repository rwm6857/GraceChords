# CODING AGENTS: READ THIS FIRST

This is a **handoff bundle** from Claude Design (claude.ai/design).

A user mocked up designs in HTML/CSS/JS using an AI design tool, then exported this bundle so a coding agent can implement the designs for real.

## What you should do — IMPORTANT

**Read `[DEMO] GC iOS.dc.html` in full.** The user had this file open when they triggered the handoff, so it's the primary design they want built. Read it top to bottom — don't skim. Then **follow its imports**: open every file it pulls in (shared components, CSS, scripts) so you understand how the pieces fit together before you start implementing.

**If anything is ambiguous, ask the user to confirm before you start implementing.** It's much cheaper to clarify scope up front than to build the wrong thing.

## About the design files

The design medium is **HTML/CSS/JS** — these are prototypes, not production code. Your job is to **recreate them pixel-perfectly** in whatever technology makes sense for the target codebase (React, Vue, native, whatever fits). Match the visual output; don't copy the prototype's internal structure unless it happens to fit.

**Don't render these files in a browser or take screenshots unless the user asks you to.** Everything you need — dimensions, colors, layout rules — is spelled out in the source. Read the HTML and CSS directly; a screenshot won't tell you anything they don't.

# GraceChords iOS — design reference

Visual specs and a clickable flow prototype exported from Claude Design, for the native (Expo / React Native) rebuild. This folder is **reference to translate from**, not code to run.

## Non-negotiables (read before building anything)

1. **Native iOS feel — HIG first.** Conform to Apple's Human Interface Guidelines and standard UIKit patterns *even where the design files don't*. The `.dc` files express visual intent; when one conflicts with a native convention (navigation, gestures, sheets, list styling, safe areas, type scale), the **native convention wins**.
2. **Never invent icons.** Use real **SF Symbols** via `expo-symbols` — no hand-drawn or generated SVG glyphs, ever. Match the symbols established in the foundation docs.
3. **Translate, don't port.** The `.dc` files are HTML/CSS/JS *prototypes*. Recreate the visual result in React Native; never copy their markup, CSS, or scripts.
4. **Staged build.** One screen per session, in the order at the bottom. Read only the file(s) for the current task.

## Authority order (when references conflict)

For how a screen should look and flow: **DEMO > UI > SPEC** (highest to lowest).

- **[DEMO] GC iOS** — the final, integrated flow. Highest authority for appearance and how screens connect. Translate its *design*, not its web runtime.
- **[UI]** — the final per-page interactive UI. Governs a single screen's layout when the DEMO doesn't settle it.
- **[SPEC]** — lowest authority for *looks* (may contain historic or unused designs), but it is where behavior lives: menu contents, placeholders, interaction notes, and **open questions / backend & non-UI requirements**. Read it for those; treat its visuals as superseded by UI and DEMO.

Native correctness (HIG / UIKit) sits above all three: those govern *design*, HIG governs *interaction*.

## Tag legend

- **[DEMO]** — all pages connected into a more-or-less functional flow.
- **[DOC]** — documentation: design requirements and tokens.
- **[UI]** — final interactive UI for a page (may or may not be fully wired).
- **[SPEC]** — per-page/component specs: menus, placeholders, possibly historic designs, and notes/requirements for backend and non-UI functions.
- **[CONTENT]** — markup partials Claude Design uses to fill interactive viewers; a thin [UI] frame pulls these in. You need **both** frame and content to see the full screen.

## Where to start

- **Tokens:** `[DOC + SPEC] App Shell & Design Tokens` — palette (Signal blue, light + dark), spacing, type.
- **Primitives / components:** `[DOC] Components & Foundations`.
- **Flow overview:** `screenshots/` — a curated walkthrough of the 20 demo screens and their sub-states. Use it to grasp the flow and intended look quickly; still read the `.dc` source for exact values.

## Design decisions (locked)

- **Daily Word opens the landing hub by default.** The `[UI] Daily Word Landing (Pass)` direction is revived: the Daily Word tab opens a landing (today's M'Cheyne reading + the signed-in user's private reflection) that routes onward to the Reader, and the Reader gains a back chevron when reached that way. A Settings → Reader toggle ("Daily Word opens") lets the user choose "Reader directly" to bypass the landing. NOTE: the landing's devotional hero card + long-read page are deferred — the public-domain (Spurgeon/Bonar) devotional content pipeline does not exist yet; the layout is forward-compatible for when it lands.
- **Home uses the H1 Hero.** Build the `[Spec] Home (H1 - Hero)` version with the subtle gradient hero header. This is the one sanctioned gradient — an atmospheric header, not a UI-surface gradient.

## Screen inventory & flow

From the demo walkthrough (`screenshots/`), grouped by feature. Items in parentheses are secondary sheets/screens off the main one.

```
Auth            — login · sign up · sign up (avatar/sprite picker)
Home            — app landing (H1 Hero)
Song Library    — list  (filter & sort)
Song Viewer     — chord chart  (options · export)        ← core screen
Setlist Builder — build  (share · options · inline edit)
Setlist Viewer  — perform  (options · export whole set)
Daily Word      — Reader  (reader settings)              ← navs straight to Reader
Settings        — settings  (offline downloads)
```

## Files by feature (canonical set)

```
foundations/
  [DOC + SPEC] App Shell & Design Tokens   ← tokens live here
  [DOC] Components & Foundations           ← primitives
app-shell/       [UI] App Shell
auth/            [SPEC] Auth · [UI] Auth
home/            [Spec] Home (H1 - Hero) · [UI] Home Screen
song-library/    [SPEC] Song Library · [UI] Song Library + [CONTENT] Song Library Content
song-viewer/     [SPEC] Song Viewer · [UI] Song Viewer · [UI] Song Flow (Library + Song View)
setlist-builder/ [SPEC] Setlist Builder (1a) · [UI] Setlist Builder
setlist-viewer/  [UI] Setlist Viewer + [CONTENT] Setlist Viewer Content
daily-word/      [SPEC] Daily Word · [UI] Daily Word · [UI] Daily Word Landing (Pass) (landing + reader; devotional deferred)
settings/        [CONTENT] Settings Content · [UI] Offline Downloads
demo/            [DEMO] GC iOS   (+ runtime files — reference only, do not port)
screenshots/     curated demo walkthrough (20 screens)
```

Notes:
- `[UI] Song Flow (Library + Song View)` is a combined library → viewer flow; use it to see the transition, with `[UI] Song Viewer` as the detailed chart spec.
- The Reader (demo screens 17–18) lives within the Daily Word feature; the tab opens the landing hub first by default (a Settings toggle can bypass it straight to the Reader).
- Main Settings UI is in `[CONTENT] Settings Content`; Offline Downloads is its own `[UI]`.

## Build order

Foundation (theme, Expo Router shell, primitives) → Song Library → Home → Song Viewer → Setlist Builder → Setlist Viewer → Daily Word / Reader → Auth → Settings → Offline Downloads.
