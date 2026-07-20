import React from 'react'
import {
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
  AudioLines,
  WifiOff,
  Wrench,
  X,
  FileMusic,
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
export const CheckIcon = wrap(Check) // SF: checkmark
export const CheckCircleIcon = wrap(CircleCheck) // SF: checkmark.circle.fill
export const ChevronDownIcon = wrap(ChevronDown) // SF: chevron.down
export const ChevronLeftIcon = wrap(ChevronLeft) // SF: chevron.left
export const ChevronUpIcon = wrap(ChevronUp) // SF: chevron.up
export const SortIcon = wrap(ChevronsUpDown) // SF: chevron.up.chevron.down
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
export const TunerIcon = wrap(AudioLines) // SF: tuningfork — compromise, no tuning fork in Lucide (see iconMap.js)
export const WifiOffIcon = wrap(WifiOff) // SF: wifi.slash
export const UtilitiesIcon = wrap(Wrench) // SF: wrench.and.screwdriver, .fill
export const CloseIcon = wrap(X) // SF: xmark
export const SongsIcon = wrap(FileMusic) // SF: music.pages, music.pages.fill
