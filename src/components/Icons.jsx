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
} from 'lucide-react'

const DEFAULT_SIZE = 18

const wrap = (Icon) => {
  const Wrapped = (props) => <Icon size={DEFAULT_SIZE} strokeWidth={2} aria-hidden="true" {...props} />
  Wrapped.displayName = Icon.displayName || Icon.name || 'Icon'
  return Wrapped
}

export const DownloadIcon = wrap(Download)
export const TransposeIcon = wrap(RefreshCw)
export const MediaIcon = wrap(LucideImage)
export const SelectAllIcon = wrap(CheckSquare)
export const ClearIcon = wrap(Trash2)
export const EyeIcon = wrap(Eye)
export const SetlistIcon = wrap(ListMusic)
export const ArrowUp = wrap(LArrowUp)
export const ArrowDown = wrap(LArrowDown)
export const ArrowLeft = wrap(LArrowLeft)
export const ArrowRight = wrap(LArrowRight)
export const RemoveIcon = wrap(XCircle)
export const GearIcon = wrap(Settings)
export const SlidersIcon = wrap(SlidersHorizontal)
export const Sun = wrap(LSun)
export const Moon = wrap(LMoon)
export const PlusIcon = wrap(Plus)
export const SaveIcon = wrap(Save)
export const CopyIcon = wrap(Copy)
export const TrashIcon = wrap(Trash2)
export const PrintIcon = wrap(Printer)
export const MinusIcon = wrap(Minus)
export const LinkIcon = wrap(LLink)
export const ExternalLinkIcon = wrap(ExternalLink)
export const PencilIcon = wrap(Pencil)
export const SearchIcon = wrap(Search)
export const CloudUploadIcon = wrap(CloudUpload)
export const CloudDownloadIcon = wrap(CloudDownload)
export const OneColIcon = wrap(AlignJustify)
export const TwoColIcon = wrap(Columns2)
export const HomeIcon = wrap(Home)
export const PlayIcon = wrap(Play)
export const PauseIcon = wrap(Pause)
export const ResetIcon = wrap(RotateCcw)
export const SendIcon = wrap(Send)
