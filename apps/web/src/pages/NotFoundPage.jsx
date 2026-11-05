import React from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/layout-kit'

export default function NotFoundPage(){
  const { t } = useTranslation('pages')
  return (
    <div className="container gc-notfound">
      <Helmet>
        <title>{t('notFound.metaTitle')}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <h1>{t('notFound.title')}</h1>
      <p className="gc-notfound__body">{t('notFound.body')}</p>
      <div className="gc-notfound__actions">
        <Button as={Link} to="/" variant="primary">{t('notFound.home')}</Button>
        <Button as={Link} to="/songs" variant="secondary">{t('notFound.songs')}</Button>
      </div>
    </div>
  )
}
