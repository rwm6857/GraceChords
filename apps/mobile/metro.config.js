// Metro config for the npm-workspaces monorepo.
//
// There are deliberately no overrides here. Two things that used to be
// configured by hand are already handled upstream:
//
// 1. Watching packages/core. Core is consumed as TypeScript SOURCE with no
//    build step (its `main` is src/index.ts), so Metro has to watch the
//    workspace package directories for edits to hot-reload. expo/metro-config
//    derives exactly that from the `workspaces` globs in the root
//    package.json — watchFolders comes back as [<root>/node_modules, apps/web,
//    apps/mobile, packages/tokens, packages/core]. Setting it here by hand only
//    risked drifting from that list. Metro transpiles core's .ts through
//    babel-preset-expo; do not add a build step to core to make mobile work.
//
// 2. Deduplicating React. npm hoists react@18.2.0 to the workspace root for
//    apps/web while mobile keeps react@19.2.0 nested, and several packages this
//    app bundles (react-i18next, @react-navigation/core, ...) are themselves
//    hoisted to the root. That does NOT put two Reacts in the bundle: Expo
//    CLI's sticky resolution pins react, react-dom, react-native and
//    @react-navigation/{core,native} to the app's copy by module NAME,
//    regardless of which file imports them — see KNOWN_STICKY_DEPENDENCIES in
//    @expo/cli's createExpoAutolinkingResolver. Verified against the shipped
//    artifact: `expo export` for ios and android each contain exactly one
//    react, apps/mobile/node_modules/react@19.2.0. `resolver.nodeModulesPaths`
//    is not what achieves this, and the copy that used to live here was
//    byte-identical to expo/metro-config's default anyway.
//
// expo-doctor's duplicate-dependency warning describes the *install tree*, not
// the bundle, and nothing in this file can clear it.
const { getDefaultConfig } = require('expo/metro-config')

module.exports = getDefaultConfig(__dirname)
