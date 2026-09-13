import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/layout-kit'
import PushToTelegramButton from '../../components/PushToTelegramButton'
import {
  DownloadIcon,
  EllipsisIcon,
  LinkIcon,
  MediaIcon,
  PencilIcon,
  ResetIcon,
  TransposeIcon,
  TrashIcon,
} from '../../components/Icons'
import { prefetchPdf } from './setlistExport'

// Every export and share action the old page had, in one place, so the desktop
// toolbar and the mobile action sheet can't drift apart.
export default function SetActions({
  items,
  worshipPath,
  pptxCount,
  busy,
  pptxProgress,
  combineProgress,
  persisted,
  onShare,
  onPdf,
  onCombinePptx,
  onBundlePptx,
  onRename,
  onDuplicate,
  onDelete,
  onTransposeSet,
  onResetKeys,
  onServiceDate,
  telegramItems,
}) {
  const { t } = useTranslation('pages')
  const [pptOpen, setPptOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const pptRef = useRef(null)
  const moreRef = useRef(null)
  const empty = items.length === 0

  useEffect(() => {
    if (!pptOpen && !moreOpen) return undefined
    function onAway(e) {
      if (pptRef.current && !pptRef.current.contains(e.target)) setPptOpen(false)
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onAway)
    return () => document.removeEventListener('mousedown', onAway)
  }, [pptOpen, moreOpen])

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        iconLeft={<LinkIcon />}
        disabled={empty}
        onClick={onShare}
        title={t('setlist.shareTooltip')}
      >
        {t('setlist.shareSet')}
      </Button>

      <Button
        size="sm"
        variant="secondary"
        iconLeft={<DownloadIcon />}
        disabled={empty || busy}
        loading={busy}
        onClick={onPdf}
        onMouseEnter={prefetchPdf}
        onFocus={prefetchPdf}
        title={t('setlist.exportPdfTooltip')}
        aria-label={t('setlist.exportPdfTooltip')}
      >
        {busy ? t('setlist.exporting') : t('setlist.exportPdf')}
      </Button>

      <div className="gc-ppt-menu" ref={pptRef}>
        <Button
          size="sm"
          variant="secondary"
          disabled={pptxCount === 0 || !!pptxProgress || !!combineProgress}
          aria-haspopup="menu"
          aria-expanded={pptOpen}
          onClick={() => setPptOpen((v) => !v)}
          title={pptxCount === 0 ? t('setlist.exportPptDisabled') : t('setlist.exportPptTooltip')}
        >
          {pptxProgress || combineProgress || t('setlist.exportPpt')}
        </Button>
        {pptOpen ? (
          <div className="gc-menu gc-ppt-menu__panel" role="menu" aria-label={t('setlist.exportPptAria')}>
            <button
              type="button"
              role="menuitem"
              className="gc-menu-item"
              onClick={() => {
                setPptOpen(false)
                onCombinePptx()
              }}
            >
              <span className="gc-menu-item-title">{t('setlist.pptCombined')}</span>
              <span className="gc-menu-item-note">{t('setlist.pptCombinedBeta')}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="gc-menu-item"
              onClick={() => {
                setPptOpen(false)
                onBundlePptx()
              }}
            >
              <span className="gc-menu-item-title">{t('setlist.pptSeparate')}</span>
              <span className="gc-menu-item-note">{t('setlist.pptZipTooltip')}</span>
            </button>
          </div>
        ) : null}
      </div>

      <PushToTelegramButton
        items={telegramItems}
        context="setlist"
        size="sm"
        label={t('setlist.sendToTelegram')}
        shortLabel={t('setlist.telegram')}
        className="gc-btn--telegram"
      />

      <Button
        variant="primary"
        size="sm"
        as={Link}
        to={worshipPath}
        iconLeft={<MediaIcon />}
        title={t('setlist.worshipModeTooltip')}
      >
        {t('setlist.worshipMode')}
      </Button>

      <div className="gc-more-menu" ref={moreRef}>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-label={t('setlist.moreActions')}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <EllipsisIcon />
        </Button>
        {moreOpen ? (
          <div className="gc-menu gc-more-menu__panel" role="menu" aria-label={t('setlist.actionsTitle')}>
            <button
              type="button"
              role="menuitem"
              className="gc-menu-item"
              onClick={() => {
                setMoreOpen(false)
                onRename()
              }}
            >
              <PencilIcon /> {t('setlist.rename')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="gc-menu-item"
              disabled={empty}
              onClick={() => {
                setMoreOpen(false)
                onTransposeSet(1)
              }}
            >
              <TransposeIcon /> {t('setlist.transposeUp')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="gc-menu-item"
              disabled={empty}
              onClick={() => {
                setMoreOpen(false)
                onTransposeSet(-1)
              }}
            >
              <TransposeIcon /> {t('setlist.transposeDown')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="gc-menu-item"
              disabled={empty}
              onClick={() => {
                setMoreOpen(false)
                onResetKeys()
              }}
            >
              <ResetIcon /> {t('setlist.resetKeys')}
            </button>
            {persisted ? (
              <>
                <hr className="gc-menu-divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="gc-menu-item"
                  onClick={() => {
                    setMoreOpen(false)
                    onServiceDate()
                  }}
                >
                  {t('setlist.fieldServiceDate')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="gc-menu-item"
                  onClick={() => {
                    setMoreOpen(false)
                    onDuplicate()
                  }}
                >
                  {t('setlist.duplicateSet')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="gc-menu-item is-danger"
                  onClick={() => {
                    setMoreOpen(false)
                    onDelete()
                  }}
                >
                  <TrashIcon /> {t('setlist.deleteSet')}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )
}
