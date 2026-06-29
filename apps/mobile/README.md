# @gracechords/mobile

The GraceChords Expo (React Native) iOS app — currently a thin **vertical slice**
that proves the shared `@gracechords/core` package and Supabase auth run
natively. It is intentionally minimal; the real native UI is not built yet.

- **Stack:** Expo SDK 55, Expo Router v7, TypeScript, React Native 0.83.
- **Native dirs:** `ios/` and `android/` use Continuous Native Generation —
  gitignored, regenerated via `npx expo prebuild`. Never commit them.

## Run it (macOS + Xcode required for the simulator)

```bash
cd apps/mobile
cp .env.example .env        # fill in the public Supabase URL + anon key
npx expo run:ios            # prebuild + build + launch on the iOS simulator
```

Without a Mac you can still verify the JS bundle (resolution + transpile of the
TS core) on any OS:

```bash
npm run export:ios          # expo export --platform ios (Metro only, no Xcode)
npm run typecheck
```

See [`AGENTS.md`](./AGENTS.md) for conventions (Metro monorepo resolution,
Supabase wiring, env, what's out of scope).
