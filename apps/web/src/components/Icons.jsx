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
