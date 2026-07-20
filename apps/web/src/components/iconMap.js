// Cross-platform icon mapping — the web half of the GraceChords icon vocabulary.
//
// This is the single documented Rosetta between the platforms:
//   UI concept  ->  SF Symbol (iOS, apps/mobile)  ->  lucide-react (web)  ->  web registry export
//
// SF Symbols are Apple-licensed and CANNOT ship on web, so web aligns SEMANTICALLY
// via lucide-react only. The iOS/Android source of truth is
// apps/mobile/src/components/symbolMap.ts (SF_TO_MATERIAL) plus the tab-bar names in
// apps/mobile/app/(tabs)/_layout.tsx. Every SF name used there must appear as a key
// below — enforced by iconMap.test.js so a new mobile icon fails CI until web catches up.
//
// `web` is the semantic export in ./Icons.jsx that renders the concept on web; the same
// export is reused across an SF symbol's outline/fill variants (web toggles the Lucide
// `fill` prop rather than shipping a second glyph). Two concepts have no clean Lucide
// match and are documented compromises (see FLAG notes): tuningfork and hand.tap.

export const ICON_MAP = {
  // concept                         SF symbol                              lucide          web export
  'antenna.radiowaves.left.and.right': { concept: 'Live session',   lucide: 'RadioTower',    web: 'LiveSessionIcon' },
  'arrow.down.circle':               { concept: 'Downloads',        lucide: 'Download',      web: 'DownloadIcon' },
  'arrow.triangle.2.circlepath':     { concept: 'Sync',             lucide: 'RefreshCw',     web: 'SyncIcon' },
  'bell':                            { concept: 'Notifications',    lucide: 'Bell',          web: 'BellIcon' },
  'book':                            { concept: 'Bible/Daily Word', lucide: 'BookOpen',      web: 'BookOpenIcon' },
  'book.fill':                       { concept: 'Daily Word (tab)', lucide: 'BookOpen',      web: 'BookOpenIcon' },
  'book.closed':                     { concept: 'Song book',        lucide: 'Book',          web: 'BookIcon' },
  'calendar':                        { concept: 'Date',             lucide: 'Calendar',      web: 'CalendarIcon' },
  'checkmark':                       { concept: 'Confirm',          lucide: 'Check',         web: 'CheckIcon' },
  'checkmark.circle.fill':           { concept: 'Confirmed',        lucide: 'CircleCheck',   web: 'CheckCircleIcon' },
  'chevron.down':                    { concept: 'Disclosure down',  lucide: 'ChevronDown',   web: 'ChevronDownIcon' },
  'chevron.left':                    { concept: 'Back',             lucide: 'ChevronLeft',   web: 'ChevronLeftIcon' },
  'chevron.right':                   { concept: 'Forward',          lucide: 'ChevronRight',  web: 'ChevronRightIcon' },
  'chevron.up':                      { concept: 'Disclosure up',    lucide: 'ChevronUp',     web: 'ChevronUpIcon' },
  'chevron.up.chevron.down':         { concept: 'Sort toggle',      lucide: 'ChevronsUpDown', web: 'SortIcon' },
  'circle.lefthalf.filled':          { concept: 'Theme',            lucide: 'Contrast',      web: 'ThemeIcon' },
  'clock':                           { concept: 'Reminder',         lucide: 'Clock',         web: 'ClockIcon' },
  'doc.on.doc':                      { concept: 'Copy',             lucide: 'Copy',          web: 'CopyIcon' },
  'doc.text':                        { concept: 'Export PDF',       lucide: 'FileText',      web: 'FileTextIcon' },
  'ellipsis':                        { concept: 'View options',     lucide: 'Ellipsis',      web: 'EllipsisIcon' },
  'envelope':                        { concept: 'Contact',          lucide: 'Mail',          web: 'MailIcon' },
  'exclamationmark.triangle.fill':   { concept: 'Warning',          lucide: 'TriangleAlert', web: 'WarningIcon' },
  'eye':                             { concept: 'Show',             lucide: 'Eye',           web: 'EyeIcon' },
  'eye.slash':                       { concept: 'Hide',             lucide: 'EyeOff',        web: 'EyeOffIcon' },
  'flame.fill':                      { concept: 'Streak',           lucide: 'Flame',         web: 'FlameIcon' },
  'globe':                           { concept: 'Language',         lucide: 'Globe',         web: 'GlobeIcon' },
  'hand.tap':                        { concept: 'Tap tempo',        lucide: 'Pointer',       web: 'TapIcon' }, // FLAG: no tap glyph in Lucide; Pointer ≈ Material touch_app. Relies on label.
  'heart':                           { concept: 'Likes',            lucide: 'Heart',         web: 'HeartIcon' },
  'heart.fill':                      { concept: 'Likes (filled)',   lucide: 'Heart',         web: 'HeartIcon' },
  'info.circle':                     { concept: 'About',            lucide: 'Info',          web: 'InfoIcon' },
  'line.3.horizontal':               { concept: 'Drag handle',      lucide: 'GripHorizontal', web: 'DragHandleIcon' },
  'line.3.horizontal.decrease':      { concept: 'Filter/sort',      lucide: 'ListFilter',    web: 'FilterIcon' },
  'link':                            { concept: 'Copy link',        lucide: 'Link',          web: 'LinkIcon' },
  'list.bullet':                     { concept: 'List',             lucide: 'List',          web: 'ListIcon' },
  'lock':                            { concept: 'Password',         lucide: 'Lock',          web: 'LockIcon' },
  'magnifyingglass':                 { concept: 'Search',           lucide: 'Search',        web: 'SearchIcon' },
  'mic.slash':                       { concept: 'Mic off',          lucide: 'MicOff',        web: 'MicOffIcon' },
  'minus':                           { concept: 'Decrement',        lucide: 'Minus',         web: 'MinusIcon' },
  'music.note':                      { concept: 'Key/chord style',  lucide: 'Music',         web: 'MusicIcon' },
  'music.note.list':                 { concept: 'Setlist',          lucide: 'ListMusic',     web: 'SetlistIcon' },
  'music.note.square.stack':         { concept: 'Setlists (tab)',   lucide: 'ListMusic',     web: 'SetlistIcon' },
  'music.note.square.stack.fill':    { concept: 'Setlists (tab)',   lucide: 'ListMusic',     web: 'SetlistIcon' },
  'music.pages':                     { concept: 'Songs (tab)',      lucide: 'FileMusic',     web: 'SongsIcon' },
  'music.pages.fill':                { concept: 'Songs (tab)',      lucide: 'FileMusic',     web: 'SongsIcon' },
  'paperplane.fill':                 { concept: 'Send',             lucide: 'Send',          web: 'SendIcon' },
  'pencil':                          { concept: 'Rename',           lucide: 'Pencil',        web: 'PencilIcon' },
  'person':                          { concept: 'Profile',          lucide: 'User',          web: 'UserIcon' },
  'person.2':                        { concept: 'Community',        lucide: 'Users',         web: 'UsersIcon' },
  'person.2.fill':                   { concept: 'Community (fill)', lucide: 'Users',         web: 'UsersIcon' }, // Lucide has no filled Users; outline stands in (matches Material `group`).
  'photo':                           { concept: 'Export JPG',       lucide: 'Image',         web: 'MediaIcon' },
  'pianokeys':                       { concept: 'Pitch pipe',       lucide: 'Piano',         web: 'PitchPipeIcon' },
  'plus':                            { concept: 'Increment/add',    lucide: 'Plus',          web: 'PlusIcon' },
  'plus.square.on.square':           { concept: 'Duplicate',        lucide: 'CopyPlus',      web: 'DuplicateIcon' },
  'questionmark.circle':             { concept: 'Help',             lucide: 'CircleHelp',    web: 'HelpIcon' },
  'square.and.arrow.up':             { concept: 'Share',            lucide: 'Share',         web: 'ShareIcon' }, // Share (box+up-arrow), NOT Share2 (network nodes).
  'square.and.pencil':               { concept: 'Compose/edit',     lucide: 'SquarePen',     web: 'ComposeIcon' },
  'star':                            { concept: 'Favorites',        lucide: 'Star',          web: 'StarIcon' },
  'star.fill':                       { concept: 'Favorite marker',  lucide: 'Star',          web: 'StarIcon' },
  'trash':                           { concept: 'Delete',           lucide: 'Trash2',        web: 'TrashIcon' },
  'tuningfork':                      { concept: 'Tuner',            lucide: 'AudioLines',    web: 'TunerIcon' }, // FLAG: no tuning fork in Lucide; AudioLines ≈ Material graphic_eq. Relies on label.
  'wifi.slash':                      { concept: 'Offline',          lucide: 'WifiOff',       web: 'WifiOffIcon' },
  'wrench.and.screwdriver':          { concept: 'Utilities',        lucide: 'Wrench',        web: 'UtilitiesIcon' }, // Lucide has no combined wrench+screwdriver; Wrench stands in (matches Material `handyman`).
  'wrench.and.screwdriver.fill':     { concept: 'Utilities (tab)',  lucide: 'Wrench',        web: 'UtilitiesIcon' },
  'xmark':                           { concept: 'Clear/close',      lucide: 'X',             web: 'CloseIcon' },
  'xmark.circle.fill':               { concept: 'Clear (filled)',   lucide: 'CircleX',       web: 'RemoveIcon' },
  'house':                           { concept: 'Home (tab)',       lucide: 'Home',          web: 'HomeIcon' },
  'house.fill':                      { concept: 'Home (tab)',       lucide: 'Home',          web: 'HomeIcon' },
}

// Web exports named in ICON_MAP that do not yet exist in ./Icons.jsx.
// The parity test allows these; it also fails if any listed name HAS since been added
// (stale entry) — so this list shrinks slice by slice and MUST be empty once the
// registry growth (Slice 3) lands. Do not use it as a dumping ground.
export const WEB_PENDING = [
  'LiveSessionIcon', 'BellIcon', 'BookOpenIcon', 'BookIcon', 'CalendarIcon',
  'CheckIcon', 'CheckCircleIcon', 'ChevronDownIcon', 'ChevronLeftIcon', 'ChevronUpIcon',
  'SortIcon', 'ThemeIcon', 'ClockIcon', 'FileTextIcon', 'EllipsisIcon', 'MailIcon',
  'WarningIcon', 'EyeOffIcon', 'FlameIcon', 'TapIcon', 'HeartIcon', 'InfoIcon',
  'DragHandleIcon', 'FilterIcon', 'ListIcon', 'LockIcon', 'MicOffIcon', 'MusicIcon',
  'UserIcon', 'UsersIcon', 'PitchPipeIcon', 'DuplicateIcon', 'HelpIcon', 'ShareIcon',
  'ComposeIcon', 'StarIcon', 'TunerIcon', 'WifiOffIcon', 'UtilitiesIcon', 'CloseIcon',
  'SongsIcon',
]
