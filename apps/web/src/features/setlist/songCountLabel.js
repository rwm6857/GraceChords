// The repo pluralizes with explicit singular/plural keys rather than i18next
// suffixes, because Korean has no `_one` category and the locale key-parity
// check compares leaf keys across every language.
export function songCountLabel(t, count) {
  return `${count} ${t(count === 1 ? 'setlist.songSingular' : 'setlist.songPlural')}`
}
