# React Patterns Audit Report - GraceChords
## Investigation Results

**Date:** 2026-03-18
**Scope:** src/ directory (43 React components, 5 custom hooks)
**Status:** Investigation complete - no code changes made

---

# HIGH SEVERITY FINDINGS (Active Storm Risk)

## 1. useRole.js → Unstable Function Returns (Root Cause)
**File:** `hooks/useRole.js:22-36`
**Line Numbers:** 22-36
**Pattern Type:** UNSTABLE DEPS IN useCallback/useMemo
**Severity:** HIGH

**Code:**
```javascript
export function useRole() {
  const { role, hasMinRole } = useAuth()

  function isAtLeast(minRole) {
    return hasMinRole(minRole)
  }

  function can(action) {
    const required = ACTIONS[action]
    if (!required) return false
    return hasMinRole(required)
  }

  return { role, isAtLeast, can }  // ← New instances every render
}
```

**Risk Explanation:**
Both `isAtLeast` and `can` are function declarations that create fresh instances on every render. Components using these as dependencies (SuggestionReviewPanel, AuditLogPanel) trigger unnecessary effect re-runs and stale permission checks. This is the cascading root cause affecting downstream consumers.

---

## 2. SuggestionReviewPanel.jsx → Missing Hook Function in Dependency Array
**File:** `components/editor/SuggestionReviewPanel.jsx:300-322`
**Line Numbers:** 300-322
**Pattern Type:** UNSTABLE DEPS IN useCallback
**Severity:** HIGH

**Code:**
```javascript
const fetchSuggestions = useCallback(async () => {
  if (!songId || !isAtLeast('editor')) return  // ← isAtLeast used
  setLoading(true)
  const { data, error: fetchError } = await supabase
    .from('song_suggestions')
    .select('*, users!suggested_by(display_name)')
    .eq('song_id', songId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  // ...
}, [songId])  // ← MISSING: isAtLeast

useEffect(() => {
  fetchSuggestions()
}, [fetchSuggestions])  // ← Effect chains on unstable callback
```

**Risk Explanation:**
The `isAtLeast` function is called inside the callback but not included in the dependency array. Since `useRole()` creates new function instances each render, the callback captures a stale reference. Permission guard logic uses outdated `isAtLeast` function, potentially allowing unauthorized queries. Parent effect depends on the unstable callback, creating cascading re-runs.

---

## 3. AuditLogPanel.jsx → Excessive Dependencies Triggering Supabase Queries
**File:** `components/editor/AuditLogPanel.jsx:27-56`
**Line Numbers:** 27-56
**Pattern Type:** SUPABASE QUERIES WITHOUT GUARDS + PROPS-AS-DEPS
**Severity:** HIGH

**Code:**
```javascript
const fetchEntries = useCallback(async () => {
  if (!isAtLeast('admin')) return
  setLoading(true)

  let query = supabase
    .from('editor_audit_log')
    .select('*, users(display_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (filterAction) query = query.eq('action', filterAction)
  if (filterDateFrom) query = query.gte('created_at', filterDateFrom)
  if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59')

  const { data, error: fetchError, count } = await query
  // ...
  setLoading(false)
}, [isAtLeast, page, filterAction, filterDateFrom, filterDateTo])  // ← 5 deps including unstable isAtLeast

useEffect(() => {
  fetchEntries()
}, [fetchEntries])
```

**Risk Explanation:**
Callback includes `isAtLeast` (unstable from useRole) plus 5 other dependencies (page + 3 filters). Every filter state change triggers a new function reference → effect re-run → new Supabase query. User changing date filter triggers immediate query. No debouncing, no request deduplication. High risk of Supabase query hammering during normal admin interaction (filtering/pagination).

---

# MEDIUM SEVERITY FINDINGS (Risk Under Certain Conditions)

## 4. StarButton.jsx → Supabase Query with Complex Dependencies
**File:** `components/song/StarButton.jsx:16-33`
**Line Numbers:** 16-33
**Pattern Type:** SUPABASE QUERIES WITHOUT GUARDS
**Severity:** MEDIUM

**Code:**
```javascript
useEffect(() => {
  if (loading) return
  if (!isLoggedIn || !userId || !songId) {
    setChecking(false)
    return
  }
  supabase
    .from('user_starred_songs')
    .select('song_id')
    .eq('user_id', userId)
    .eq('song_id', songId)
    .maybeSingle()
    .then(({ data }) => {
      setStarred(!!data)
      setChecking(false)
    })
}, [loading, isLoggedIn, userId, songId])  // ← 4 dependencies
```

**Risk Explanation:**
Four dependencies in the array. If any dependency changes (especially `loading` state from parent re-renders), a fresh query executes. No abort/cleanup for pending requests - if component remounts rapidly or dependency array churns, multiple in-flight requests accumulate. Risk is conditional but present in high-render-frequency scenarios (song list navigation).

---

## 5. SetlistPage.jsx → Derived Value Used as Dependency
**File:** `pages/SetlistPage.jsx:219-238`
**Line Numbers:** 219-238
**Pattern Type:** UNSTABLE DEPS IN useEffect
**Severity:** MEDIUM

**Code:**
```javascript
const catalog = useMemo(() => buildSongCatalog(songs), [songs])

useEffect(()=>{
  const out = []
  for (const group of catalog.groups || []) {
    // build items...
  }
  setItems(out)
}, [catalog.groups, selectedLanguage])  // ← Derived value as dependency
```

**Risk Explanation:**
`catalog.groups` is a derived value created by `buildSongCatalog(songs)`. While technically valid (memoized), using the derived value as a dependency creates indirect dependency on the memoized object's structure. If the memoization function changes its implementation, the effect could miss updates. Better practice: depend on source (`songs`) or the entire `catalog` object.

---

## 6. WorshipModePage.jsx → Entire Object as Memoization Dependency
**File:** `pages/WorshipModePage.jsx:43-46`
**Line Numbers:** 43-46
**Pattern Type:** UNSTABLE DEPS IN useMemo
**Severity:** MEDIUM

**Code:**
```javascript
const selectedLanguage = useMemo(
  () => resolveInitialSongLanguage(
    catalog.translationLanguages?.length
      ? catalog.translationLanguages
      : catalog.allLanguages
  ),
  [catalog]  // ← Entire object, not specific properties
)
```

**Risk Explanation:**
The entire `catalog` object is used as a dependency. The memoized result recalculates whenever ANY property of `catalog` changes, not just language-related properties. Causes unnecessary memoization cache misses and triggers downstream recalculations if `selectedLanguage` is used as a dependency in other effects.

---

## 7. SongViewPage.jsx → Excessive Unused Dependencies in ResizeObserver Effect
**File:** `pages/SongViewPage.jsx:153-165`
**Line Numbers:** 153-165
**Pattern Type:** UNSTABLE DEPS IN useEffect
**Severity:** MEDIUM

**Code:**
```javascript
useEffect(() => {
  if (!isNarrow) return  // ← Early exit
  const el = mobileDockRef.current
  if (!el) return
  const update = () => {
    try { setMobileDockHeight(el.offsetHeight || 96) } catch {}
  }
  update()
  if (typeof ResizeObserver === 'undefined') return
  const ro = new ResizeObserver(update)
  ro.observe(el)
  return () => ro.disconnect()
}, [isNarrow, hasPptx, jpgDisabled, toKey, showChords])  // ← 5 deps, only isNarrow used
```

**Risk Explanation:**
Effect has early-return guard on `isNarrow` but includes 4 unused dependencies (`hasPptx`, `jpgDisabled`, `toKey`, `showChords`). Any change to these props tears down and recreates the ResizeObserver unnecessarily, flickering mobile dock height calculation on unrelated state changes.

---

## 8. SegmentedControl.jsx → Array Prop as Direct Dependency
**File:** `components/ui/layout-kit/SegmentedControl.jsx:18`
**Line Numbers:** 18
**Pattern Type:** PROPS-AS-DEPS ANTI-PATTERN
**Severity:** MEDIUM

**Code:**
```javascript
const enabledIndexes = useMemo(
  () => options.map((opt, i) => opt.disabled ? null : i).filter(i => i !== null),
  [options]  // ← If parent passes new array every render, memoization is useless
)
```

**Risk Explanation:**
The `options` array prop is a dependency. If parent component creates a new array on every render (even with identical content), this memoization provides no benefit and `enabledIndexes` recalculates every render. Parent components should memoize the array with `useMemo` or maintain it outside render.

---

# LOW SEVERITY FINDINGS (Code Smell, Unlikely to Trigger)

## 9. ProfilePage.jsx → Missing await on Promise Chain
**File:** `pages/ProfilePage.jsx:51-78`
**Line Numbers:** 51-78
**Pattern Type:** SUPABASE QUERIES WITHOUT GUARDS
**Severity:** LOW

**Code:**
```javascript
useEffect(() => {
  if (!session) return
  supabase
    .from('user_starred_songs')
    .select('song_id, songs!inner(slug, title, default_key, artist)')
    .eq('user_id', session.user.id)
    .order('songs(title)')
    .then(({ data, error }) => {
      if (error) console.error('[ProfilePage] Failed to load starred songs:', error)
      setStarredItems(data || [])
      setStarsLoading(false)
    })
  Promise.all([...])  // ← Not awaited; possible race condition
}, [session])
```

**Risk Explanation:**
Code mixes `.then()` chains with `Promise.all([])` without proper await or coordination. If multiple queries execute in parallel and one fails before being logged, the UI could display incomplete state. Low priority because `session` is a stable dependency and queries are relatively fast.

---

## 10. PostsPage.jsx → Empty Dependency Array (Static Content)
**File:** `pages/PostsPage.jsx:53-58`
**Line Numbers:** 53-58
**Pattern Type:** SUPABASE QUERIES WITHOUT GUARDS
**Severity:** LOW

**Code:**
```javascript
useEffect(() => {
  fetchPublishedPostsWithAuthors().then(({ data, error }) => {
    if (!error) setPosts(data || [])
    setLoading(false)
  })
}, [])  // ← Fetches only on mount, no refresh mechanism
```

**Risk Explanation:**
Effect only runs once on mount. No way to manually refresh or re-fetch posts. Low severity if content is truly static (published posts), but limits UX for manual refresh workflows.

---

## 11. AdminPage.jsx → No Refresh Trigger for Data
**File:** `pages/AdminPage.jsx:53-56`
**Line Numbers:** 53-56
**Pattern Type:** SUPABASE QUERIES WITHOUT GUARDS
**Severity:** LOW

**Code:**
```javascript
useEffect(() => {
  loadUsers()
  loadPendingRequests()
}, [])  // ← No dependency, no way to trigger refresh after initial load
```

**Risk Explanation:**
Data loads once on mount with no refresh mechanism. Admin viewing stale user list or pending requests cannot manually refresh without page reload. Low priority if page is rarely revisited, but impacts admin workflow efficiency.

---

## 12. SongViewPage.jsx → Dependency Chain on Derived Values
**File:** `pages/SongViewPage.jsx:98-100`
**Line Numbers:** 98-100
**Pattern Type:** UNSTABLE DEPS IN useMemo
**Severity:** LOW

**Code:**
```javascript
const SONG_CATALOG = useMemo(() => buildSongCatalog(songs), [songs])
const entry = useMemo(() => getEntryById(SONG_CATALOG, id), [SONG_CATALOG, id])
const translationGroup = useMemo(() => getGroupByEntryId(SONG_CATALOG, id), [SONG_CATALOG, id])
```

**Risk Explanation:**
Downstream memos depend on `SONG_CATALOG` (a derived/memoized value) rather than the source `songs`. While functionally correct, creates indirect dependency chain. More direct approach: depend on `[songs, id]` for both memos. Low priority - works correctly, just suboptimal pattern.

---

# PRIORITIZED FIX ORDER

Based on component criticality and cascading impact:

## Tier 1: Fix Immediately (Critical Path)
1. **useRole.js** (hooks/useRole.js:22-36)
   - Memoize `isAtLeast` and `can` with `useCallback`
   - Root cause cascading to 2+ components
   - Impact: High (fixes issues #1, #2, #3 cascade)

2. **SuggestionReviewPanel.jsx** (components/editor/SuggestionReviewPanel.jsx:300)
   - Add `isAtLeast` to dependency array (after useRole.js fix)
   - Actively used in editor portal; high render frequency
   - Impact: Core editor flow

## Tier 2: Fix in Next Sprint (High-Impact)
3. **AuditLogPanel.jsx** (components/editor/AuditLogPanel.jsx:27-56)
   - Remove `isAtLeast` from deps after useRole.js fix
   - Add debouncing for filter/page changes
   - Prevents Supabase query hammering
   - Impact: Admin panel performance

4. **SongViewPage.jsx** (pages/SongViewPage.jsx:153-165)
   - Remove unused dependencies: `[isNarrow]` only
   - Prevents mobile dock flickering
   - Impact: Core song view rendering

## Tier 3: Medium-Impact (Fix Soon)
5. **WorshipModePage.jsx** (pages/WorshipModePage.jsx:43-46)
   - Refine `catalog` to specific properties needed
   - Impact: Moderate (affects language selection)

6. **SetlistPage.jsx** (pages/SetlistPage.jsx:219-238)
   - Depend on `songs` instead of derived `catalog.groups`
   - Impact: Moderate (setlist view)

7. **StarButton.jsx** (components/song/StarButton.jsx:16-33)
   - Add abort/cleanup for pending requests
   - Impact: Moderate (prevents request accumulation)

## Tier 4: Polish (Longer-term)
8. **SegmentedControl.jsx** (components/ui/layout-kit/SegmentedControl.jsx:18)
   - Document parent memoization requirement
   - Impact: Low (UI utility)

9. **SongViewPage.jsx** (pages/SongViewPage.jsx:98-100)
   - Remove intermediate derived value dependencies
   - Impact: Low (code hygiene)

10. **ProfilePage.jsx** (pages/ProfilePage.jsx:51-78)
    - Add proper error boundaries and await on Promise.all
    - Impact: Low (error recovery)

11. **PostsPage.jsx** (pages/PostsPage.jsx:53-58)
    - Add manual refresh trigger
    - Impact: Low (UX enhancement)

12. **AdminPage.jsx** (pages/AdminPage.jsx:53-56)
    - Add refresh button/mechanism
    - Impact: Low (admin workflow)

---

# SUMMARY STATISTICS

| Category | Count |
|----------|-------|
| **Total Findings** | 12 |
| **High Severity** | 3 |
| **Medium Severity** | 5 |
| **Low Severity** | 4 |
| **Files Affected** | 10 |
| **Root Causes** | 1 (useRole.js) |
| **Critical Path Components** | 2 (EditorPage → SuggestionReviewPanel, AuditLogPanel) |

---

# INVESTIGATION METHODOLOGY

**Patterns Searched:**
1. ✅ Unstable dependencies in useCallback/useMemo/useEffect
2. ✅ Inline functions and object/array literals as dependencies
3. ✅ Hook return values used as dependencies (useRole, useAuth)
4. ✅ Supabase queries with unguarded dependencies
5. ✅ Missing loading/fetched ref guards
6. ✅ State update cycles feeding back into deps
7. ✅ Real-time subscription leaks without cleanup
8. ✅ Props-as-deps anti-pattern

**Files Audited:**
- 43 React components (JSX/TSX)
- 5 custom hooks
- 20 page components
- 19 Supabase integration points

**Result:** No real-time subscription leaks found (architecture uses polling). All critical Supabase calls in event handlers properly error-handled.

---

# END OF INVESTIGATION REPORT

*Investigation complete. No code changes made per task requirements. Report ready for developer review and prioritized remediation planning.*
