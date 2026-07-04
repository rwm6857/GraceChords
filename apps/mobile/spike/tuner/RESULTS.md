# Tuner spike — Phase 1 results (gate report)

Spike for the Utilities-tab guitar tuner: prove the low-latency pitch pipeline
before any UI is built. Everything in `spike/tuner/` is throwaway; the pure
detection logic it exercises lives in `src/lib/tuner/` (unit-tested) and is the
piece Phase 2 keeps.

## Pipeline viability: `react-native-audio-api` — CONFIRMED

Verified against the published package source (v0.13.1, npm, July 2026 —
actively maintained, nightly builds current), not training-data assumptions:

- **Raw real-time buffers: yes.** `AudioRecorder.onAudioReady({ sampleRate,
  bufferLength, channelCount }, cb)` pushes Float32 PCM `AudioBuffer`s to JS at
  the requested cadence (native side: AVAudioEngine input tap → ring buffer →
  event per `bufferLength` frames). No file is ever written unless
  `enableFileOutput()` is explicitly called — we never call it, so "no audio
  recorded/stored" holds by construction.
- **New architecture / SDK 55: yes.** TurboModule (codegen spec), peer-depends
  on `react-native-worklets >= 0.6.0` (app has 0.7.4). Podspec explicitly
  handles static/dynamic frameworks (app uses `useFrameworks: static`).
- **Permissions: built in.** `AudioManager.request/checkRecordingPermissions()`
  (`Undetermined | Denied | Granted`) — supports ask-on-first-use.
- **Expo config plugin: yes.** `app.json` now carries the plugin with
  `iosMicrophonePermission` (on-device-only wording), `iosBackgroundMode:
  false`, `androidPermissions: [RECORD_AUDIO]` (future parity — Android build
  isn't configured otherwise; TODO(android)), `androidForegroundService: false`,
  and `disableFFmpeg: true` (drops 4 vendored FFmpeg xcframeworks the tuner
  doesn't need; re-enable if a future feature must decode m4a/ogg/etc.).
- **Session control matters:** `AudioManager.setAudioSessionOptions({
  iosCategory: 'record', iosMode: 'measurement' })` — `measurement` disables
  system input processing (AGC/voice isolation) that would otherwise mangle
  the signal. The harness sets this.

`AnalyserNode`/`getFloatTimeDomainData` also exists, but `onAudioReady` is the
better fit (push, not poll) and is what the pipeline uses.

## Method

Headless benchmark (`bench.ts`, run with `npx -y tsx spike/tuner/bench.ts`)
streams synthetic plucks through the exact device pipeline shape — hop-sized
callbacks → decimation → ring buffer → YIN (`src/lib/tuner/yin.ts`, CMNDF +
absolute threshold 0.12 + parabolic interpolation, no global-min fallback) →
median-5 + EMA-0.35 smoothing. Signals model what breaks naive detectors:
stiff-string inharmonicity, per-partial decay, pick transient, **weak low-E
fundamental (0.3×)**, and background noise. Matrix: 6 strings × detune
{0, +8, −20}¢ × SNR {clean, 25 dB, 15 dB} × 3 seeds = 270 plucks per config.

Caveats to confirm on device (harness below): synthetic ≠ real guitar/room;
compute times are Node/V8 — Hermes is typically a few × slower; real iOS mic
adds its own IO buffer (~10–20 ms).

## Numbers

| config | 1st reading ms (med/p90) | worst bias (c) | raw jitter std med (c) | raw p95 dev med (c) | gross err % | settle ms med | smoothed jitter med (c) | detect ms/call (Node) |
|---|---|---|---|---|---|---|---|---|
| 48k w2048 h1024 | 35 / 57 | 31.9 | 2.30 | 4.72 | 1.35 | 99 | 0.82 | 1.29 |
| 48k w4096 h1024 | 57 / 78 | 24.7 | 1.42 | 2.66 | 0.44 | 142 | 0.74 | 3.20 |
| 24k w1024 h512 | 35 / 57 | 15.3 | 0.97 | 2.08 | 0.26 | 121 | 0.45 | 0.32 |
| **24k w2048 h512** | **35 / 57** | **8.8** | **0.52** | **1.08** | **0.02** | **142** | **0.43** | **0.80** |
| 12k w1024 h256 | 35 / 57 | 2.8 | 0.29 | 0.60 | 0.00 | 163 | 0.38 | 0.20 |

("worst bias" is the single worst pluck's steady-state mean error across the
whole matrix — dominated by the 15 dB noisy-room cases. At ≥25 dB SNR the
recommended config's worst bias is 1.6 c.)

Recommended config, per string (includes the 15 dB cases):

| string | 1st reading ms med | bias c med | raw jitter std med c | gross % | settle ms med | smoothed jitter med c |
|---|---|---|---|---|---|---|
| **E2 (low E)** | 57 | 1.3 | 0.77 | 0.00 | 270 | 0.57 |
| A2 | 57 | 0.6 | 0.57 | 0.00 | 206 | 0.45 |
| D3 | 35 | 0.5 | 0.55 | 0.00 | 185 | 0.34 |
| G3 | 35 | 0.3 | 0.46 | 0.00 | 142 | 0.23 |
| B3 | 35 | 0.3 | 0.42 | 0.00 | 57 | 0.20 |
| E4 | 35 | 0.3 | 0.45 | 0.14 | 35 | 0.21 |

Full sweep output: run the bench; per-string tables for every config are
printed.

## Latency vs. stability — recommended starting balance

**Capture 48 kHz mono, `bufferLength` 1024 (21.3 ms callbacks) → decimate ×2 →
24 kHz, YIN window 2048 (85.3 ms), detect every callback, median-5 + EMA-0.35
on cents, RMS gate ~0.008, in-tune hold when |cents| ≤ 4 for ~500 ms.**

- Update cadence: every 21.3 ms (needle redraws ~47×/s).
- Pluck → first correct reading (algorithmic): 35–57 ms. Add iOS input buffer
  (~10–20 ms) + detect (≈1–4 ms Hermes est.) + one render frame (≤16.7 ms):
  **~70–100 ms perceived**, i.e. "immediate".
- Held-note needle: raw jitter ≈ 0.5 c std (low E 0.8 c); smoothed ≈ 0.4 c —
  visually still. Smoothing costs ~2 hops (~43 ms) of lag; settle to ±3 c in
  ~140 ms (low E ~270 ms).
- Gross (octave) errors: 0.02% of readings across the matrix, all in the
  15 dB noisy case, and single-frame — the median absorbs them.
- Low E specifically: with a 0.3× fundamental it tracks with zero octave
  errors; it is simply the slowest to settle (~270 ms) — acceptable.
- The window is the stability lever: 1024 halves compute and settles slightly
  faster but triples noisy-room bias (15.3 c worst); 12 kHz analysis is even
  steadier and cheaper but relies on a crude decimator and thinner margins at
  E4 — keep as an optimization candidate, validate on device before adopting.

## On-device harness

`TunerSpikeScreen` (this folder) runs the exact recommended pipeline on
hardware — dev builds only, via Utilities → Tuner ("Spike harness") or
`/dev/tuner-spike`. It shows live Hz / raw vs smoothed cents / clarity, ~1 s
jitter std, callback cadence avg/max, detect cost avg/max, and permission
state, so the numbers above can be confirmed with a real guitar. Requires a
dev build on device (`npx expo run:ios --device`); the audio stack is native,
so nothing runs in a simulator mic-free or in Expo Go.

## Phase 2 notes discovered during the spike

- Privacy policy lives at `apps/web/src/content/privacy-policy.md`, rendered by
  the web app's `PrivacyPage` — web-hosted (Cloudflare Pages), so the tuner
  section ships with a web deploy, not the app build.
- `src/lib/tuner/` (notes/yin/smoothing) is the reusable, unit-tested core;
  Phase 2 adds only the capture glue + UI. Tuning is data (`STANDARD_TUNING`),
  so alternate tunings are a later additive change.
- Everything under `spike/tuner/` + `app/dev/tuner-spike.tsx` is deletable when
  the real tuner ships.

## Go / no-go: **GO** (pending on-device confirmation of the same numbers)
