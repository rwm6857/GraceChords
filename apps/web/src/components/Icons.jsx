import React from 'react'
import {
  ChartNoAxesColumn,
  Download,
  RefreshCw,
  Image as LucideImage,
  CheckSquare,
  Trash2,
  Eye,
  ListMusic,
  ArrowUp as LArrowUp,
  ArrowDown as LArrowDown,
  ArrowLeft as LArrowLeft,
  ArrowRight as LArrowRight,
  XCircle,
  Settings,
  SlidersHorizontal,
  Sun as LSun,
  Moon as LMoon,
  Plus,
  Save,
  Copy,
  Printer,
  Minus,
  Link as LLink,
  ExternalLink,
  Pencil,
  Search,
  CloudUpload,
  CloudDownload,
  AlignJustify,
  Columns2,
  Home,
  Play,
  Pause,
  RotateCcw,
  Send,
  Globe,
  ChevronRight,
  LogOut,
  RadioTower,
  Bell,
  BookOpen,
  Book,
  Calendar,
  Check,
  CircleCheck,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ChevronsUpDown,
  CirclePile,
  Contrast,
  Clock,
  FileText,
  Ellipsis,
  Mail,
  TriangleAlert,
  EyeOff,
  Flame,
  Pointer,
  Heart,
  Info,
  GripHorizontal,
  ListFilter,
  List,
  Lock,
  MicOff,
  Music,
  User,
  Users,
  Piano,
  CopyPlus,
  CircleHelp,
  Share,
  SquarePen,
  Star,
  ALargeSmall,
  AudioLines,
  WifiOff,
  Wrench,
  X,
  FileMusic,
  Apple,
  QrCode,
} from 'lucide-react'

const DEFAULT_SIZE = 18

const wrap = (Icon) => {
  const Wrapped = (props) => <Icon size={DEFAULT_SIZE} strokeWidth={2} aria-hidden="true" {...props} />
  Wrapped.displayName = Icon.displayName || Icon.name || 'Icon'
  return Wrapped
}

// SF-symbol annotations map each export to its apps/mobile counterpart (see iconMap.js).
// "web-only" marks concepts with no mobile SF equivalent.
export const DownloadIcon = wrap(Download) // SF: arrow.down.circle
export const TransposeIcon = wrap(RefreshCw) // web-only (transpose; distinct from SyncIcon)
export const SyncIcon = wrap(RefreshCw) // SF: arrow.triangle.2.circlepath
export const MediaIcon = wrap(LucideImage) // SF: photo
export const SelectAllIcon = wrap(CheckSquare) // web-only
export const ClearIcon = wrap(Trash2) // web-only (clear; distinct from TrashIcon)
export const EyeIcon = wrap(Eye) // SF: eye
export const SetlistIcon = wrap(ListMusic) // SF: music.note.list, music.note.square.stack
export const ArrowUp = wrap(LArrowUp) // web-only
export const ArrowDown = wrap(LArrowDown) // web-only
export const ArrowLeft = wrap(LArrowLeft) // web-only
export const ArrowRight = wrap(LArrowRight) // web-only
export const RemoveIcon = wrap(XCircle) // SF: xmark.circle.fill
export const GearIcon = wrap(Settings) // web-only
export const SlidersIcon = wrap(SlidersHorizontal) // web-only
export const Sun = wrap(LSun) // web-only
export const Moon = wrap(LMoon) // web-only
export const PlusIcon = wrap(Plus) // SF: plus
export const SaveIcon = wrap(Save) // web-only
export const CopyIcon = wrap(Copy) // SF: doc.on.doc
export const TrashIcon = wrap(Trash2) // SF: trash
export const PrintIcon = wrap(Printer) // web-only
export const MinusIcon = wrap(Minus) // SF: minus
export const LinkIcon = wrap(LLink) // SF: link
export const ExternalLinkIcon = wrap(ExternalLink) // web-only
export const PencilIcon = wrap(Pencil) // SF: pencil
export const SearchIcon = wrap(Search) // SF: magnifyingglass
export const CloudUploadIcon = wrap(CloudUpload) // web-only
export const CloudDownloadIcon = wrap(CloudDownload) // web-only
export const OneColIcon = wrap(AlignJustify) // web-only
export const TwoColIcon = wrap(Columns2) // web-only
export const HomeIcon = wrap(Home) // SF: house, house.fill
export const PlayIcon = wrap(Play) // web-only
export const PauseIcon = wrap(Pause) // web-only
export const ResetIcon = wrap(RotateCcw) // web-only
export const SendIcon = wrap(Send) // SF: paperplane.fill
export const GlobeIcon = wrap(Globe) // SF: globe
export const ChevronRightIcon = wrap(ChevronRight) // SF: chevron.right
export const LogOutIcon = wrap(LogOut) // web-only

// --- Signal Blue convergence: semantic exports mirroring the mobile SF vocabulary ---
// (see iconMap.js). Additive only — not yet wired to consumers. Outline/fill SF variants
// share one export; callers pass fill via props where a solid state is needed.
export const LiveSessionIcon = wrap(RadioTower) // SF: antenna.radiowaves.left.and.right
export const BellIcon = wrap(Bell) // SF: bell
export const BookOpenIcon = wrap(BookOpen) // SF: book, book.fill
export const BookIcon = wrap(Book) // SF: book.closed
export const CalendarIcon = wrap(Calendar) // SF: calendar
export const StatsIcon = wrap(ChartNoAxesColumn) // SF: chart.bar
export const CheckIcon = wrap(Check) // SF: checkmark
export const CheckCircleIcon = wrap(CircleCheck) // SF: checkmark.circle.fill
export const ChevronDownIcon = wrap(ChevronDown) // SF: chevron.down
export const ChevronLeftIcon = wrap(ChevronLeft) // SF: chevron.left
export const ChevronUpIcon = wrap(ChevronUp) // SF: chevron.up
export const SortIcon = wrap(ChevronsUpDown) // SF: chevron.up.chevron.down
export const KeyReferenceIcon = wrap(CirclePile) // SF: circle.hexagongrid
export const ThemeIcon = wrap(Contrast) // SF: circle.lefthalf.filled
export const ClockIcon = wrap(Clock) // SF: clock
export const FileTextIcon = wrap(FileText) // SF: doc.text
export const EllipsisIcon = wrap(Ellipsis) // SF: ellipsis
export const MailIcon = wrap(Mail) // SF: envelope
export const WarningIcon = wrap(TriangleAlert) // SF: exclamationmark.triangle.fill
export const EyeOffIcon = wrap(EyeOff) // SF: eye.slash
export const FlameIcon = wrap(Flame) // SF: flame.fill
export const TapIcon = wrap(Pointer) // SF: hand.tap — compromise, no tap glyph in Lucide (see iconMap.js)
export const HeartIcon = wrap(Heart) // SF: heart, heart.fill
export const InfoIcon = wrap(Info) // SF: info.circle
export const DragHandleIcon = wrap(GripHorizontal) // SF: line.3.horizontal
export const FilterIcon = wrap(ListFilter) // SF: line.3.horizontal.decrease
export const ListIcon = wrap(List) // SF: list.bullet
export const LockIcon = wrap(Lock) // SF: lock
export const MicOffIcon = wrap(MicOff) // SF: mic.slash
export const MusicIcon = wrap(Music) // SF: music.note
export const UserIcon = wrap(User) // SF: person
export const UsersIcon = wrap(Users) // SF: person.2, person.2.fill (no filled Users in Lucide)
export const PitchPipeIcon = wrap(Piano) // SF: pianokeys
export const DuplicateIcon = wrap(CopyPlus) // SF: plus.square.on.square
export const HelpIcon = wrap(CircleHelp) // SF: questionmark.circle
export const ShareIcon = wrap(Share) // SF: square.and.arrow.up (Share, not Share2)
export const ComposeIcon = wrap(SquarePen) // SF: square.and.pencil
export const StarIcon = wrap(Star) // SF: star, star.fill
export const TextFormatIcon = wrap(ALargeSmall) // SF: textformat
export const TunerIcon = wrap(AudioLines) // SF: tuningfork — compromise, no tuning fork in Lucide (see iconMap.js)
export const WifiOffIcon = wrap(WifiOff) // SF: wifi.slash
export const UtilitiesIcon = wrap(Wrench) // SF: wrench.and.screwdriver, .fill
export const CloseIcon = wrap(X) // SF: xmark
export const SongsIcon = wrap(FileMusic) // SF: music.pages, music.pages.fill
export const AppleIcon = wrap(Apple) // web-only (App Store / iOS platform mark)
export const QrCodeIcon = wrap(QrCode) // web-only

// Brand marks for the sign-in buttons. These keep the providers' own artwork
// and colours (Google's four-colour G; Apple's logo in the button's text colour)
// as their brand guidelines require, so they do not use the lucide wrapper.
export function GoogleLogo({ size = DEFAULT_SIZE, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" focusable="false" {...props}>
      <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

export function AppleLogo({ size = DEFAULT_SIZE, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z"
      />
    </svg>
  )
}
