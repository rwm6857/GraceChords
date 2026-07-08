// Metro's require.context (used by resources.ts to load the locale folders).
// @types/node's Require interface doesn't declare it, so augment it here.
interface MetroRequireContext {
  keys(): string[]
  (id: string): unknown
}

declare namespace NodeJS {
  interface Require {
    context(
      directory: string,
      useSubdirectories?: boolean,
      regExp?: RegExp,
      mode?: string
    ): MetroRequireContext
  }
}
