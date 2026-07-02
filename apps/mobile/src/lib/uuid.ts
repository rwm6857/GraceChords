// RFC-4122 v4 UUID. Used for optimistic setlist creation: the client mints the
// id so it can navigate into the builder immediately while the INSERT is still
// in flight. Not security-sensitive (it's a row id), so Math.random is fine.
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
