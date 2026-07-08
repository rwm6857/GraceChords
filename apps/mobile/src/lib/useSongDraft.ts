import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BLANK_SONG_FORM,
  canonicalizeForm,
  formToSongRow,
  validateSongForm,
  hasFormErrors,
  canDirectWrite,
  createPersonalSong,
  updatePersonalSong,
  submitSongSuggestion,
  upsertSong,
  writeAuditLog,
} from '@gracechords/core'
import type { SongForm, SongFormErrors } from '@gracechords/core'
import { supabase } from './supabase'
import { getDraft, upsertDraft, removeDraft, flushDrafts } from './drafts/draftsStore'

// The song-editor engine: owns the working form, autosaves it to the local
// drafts store (debounced there), and performs the three write actions —
// Save (to personal_songs), Submit for review (personal_songs + a
// song_suggestion), and Publish (editor+ direct write to the public catalog).
export function useSongDraft(draftId: string, role: string) {
  const initial = getDraft(draftId)
  const [form, setForm] = useState<SongForm>(initial?.form ?? { ...BLANK_SONG_FORM })
  const personalSongId = useRef<string | null>(initial?.personalSongId ?? null)
  const sourceSongId = useRef<string | null>(initial?.sourceSongId ?? null)
  const publishedSongId = useRef<string | null>(initial?.publishedSongId ?? null)
  const [busy, setBusy] = useState(false)

  const errors: SongFormErrors = validateSongForm(form)
  const hasErrors = hasFormErrors(errors)

  // Autosave every field change to the local draft (the store debounces disk).
  const persistDraft = useCallback(
    (next: SongForm) => {
      upsertDraft({
        id: draftId,
        personalSongId: personalSongId.current,
        sourceSongId: sourceSongId.current,
        publishedSongId: publishedSongId.current,
        form: next,
        status: 'draft',
        updatedAt: '',
      })
    },
    [draftId],
  )

  const setField = useCallback(
    <K extends keyof SongForm>(field: K, value: SongForm[K]) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value }
        persistDraft(next)
        return next
      })
    },
    [persistDraft],
  )

  // Flush any pending debounced draft write when leaving the editor.
  useEffect(() => () => flushDrafts(), [])

  // Ensure a personal_songs row exists for this draft; returns its id.
  const ensurePersonalSong = useCallback(async (): Promise<string> => {
    const row = formToSongRow(canonicalizeForm(form))
    if (personalSongId.current) {
      await updatePersonalSong(supabase, personalSongId.current, row)
      return personalSongId.current
    }
    const created = (await createPersonalSong(supabase, {
      ...row,
      status: 'draft',
      source_song_id: sourceSongId.current,
    })) as unknown as { id: string }
    personalSongId.current = created.id
    persistDraft(form)
    return created.id
  }, [form, persistDraft])

  const saveDraft = useCallback(async () => {
    setBusy(true)
    try {
      await ensurePersonalSong()
    } finally {
      setBusy(false)
    }
  }, [ensurePersonalSong])

  const submitForReview = useCallback(async () => {
    if (hasErrors) throw new Error('Fix the required fields first.')
    setBusy(true)
    try {
      const pid = await ensurePersonalSong()
      const isEdit = !!(sourceSongId.current || publishedSongId.current)
      await submitSongSuggestion(supabase, {
        type: isEdit ? 'edit' : 'addition',
        payload: formToSongRow(canonicalizeForm(form)),
        songId: sourceSongId.current ?? publishedSongId.current ?? null,
        personalSongId: pid,
      })
      await updatePersonalSong(supabase, pid, { status: 'submitted' })
      removeDraft(draftId)
    } finally {
      setBusy(false)
    }
  }, [draftId, ensurePersonalSong, form, hasErrors])

  const publish = useCallback(async () => {
    if (!canDirectWrite(role)) throw new Error('Only editors can publish directly.')
    if (hasErrors) throw new Error('Fix the required fields first.')
    setBusy(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const actorId = userData?.user?.id
      const existing = publishedSongId.current ? { id: publishedSongId.current } : {}
      const saved = await upsertSong(supabase, canonicalizeForm(form), existing)
      try {
        await writeAuditLog(supabase, {
          actorId,
          action: 'direct_save',
          songId: saved.id,
          songSlug: saved.slug,
          songTitle: saved.title,
        })
      } catch {
        // audit is best-effort
      }
      if (personalSongId.current) {
        await updatePersonalSong(supabase, personalSongId.current, {
          status: 'published',
          published_song_id: saved.id,
        })
      }
      removeDraft(draftId)
      return saved
    } finally {
      setBusy(false)
    }
  }, [draftId, form, hasErrors, role])

  return {
    form,
    setField,
    errors,
    hasErrors,
    busy,
    canPublish: canDirectWrite(role),
    saveDraft,
    submitForReview,
    publish,
  }
}
