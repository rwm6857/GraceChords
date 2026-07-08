// Bundled i18next resources, built from the locale folders via Metro's
// require.context so the folders are the source of truth: adding
// src/i18n/locales/<code>/ with the same JSON files as en/ is all it takes to
// add a language (plus a label in config.ts). Keep this module out of vitest
// imports — require.context only exists under Metro.

type NamespaceResources = Record<string, Record<string, unknown>>

const ctx = require.context('./locales', true, /\.json$/)

const resources: Record<string, NamespaceResources> = {}
for (const key of ctx.keys()) {
  const match = key.match(/^\.\/([\w-]+)\/([\w-]+)\.json$/)
  if (!match) continue
  const [, locale, ns] = match
  ;(resources[locale] ??= {})[ns] = ctx(key) as Record<string, unknown>
}

export const RESOURCES = resources
export const SUPPORTED_LOCALES = Object.keys(resources).sort()
export const I18N_NAMESPACES = Object.keys(resources.en ?? {}).sort()
