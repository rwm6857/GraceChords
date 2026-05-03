import { render, screen, act } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

function NavSample() {
  const { t } = useTranslation('nav')
  return <nav aria-label="sample">{t('home')}</nav>
}

describe('i18n smoke', () => {
  test('renders English by default', () => {
    render(<NavSample />)
    expect(screen.getByLabelText('sample')).toHaveTextContent('Home')
  })

  test('switches to Korean when language changes', async () => {
    render(<NavSample />)
    await act(async () => {
      await i18n.changeLanguage('ko')
    })
    expect(screen.getByLabelText('sample')).toHaveTextContent('홈')
  })

  test('switches to Turkish', async () => {
    render(<NavSample />)
    await act(async () => {
      await i18n.changeLanguage('tr')
    })
    expect(screen.getByLabelText('sample')).toHaveTextContent('Ana Sayfa')
  })

  test('falls back to English for unknown language', async () => {
    render(<NavSample />)
    await act(async () => {
      await i18n.changeLanguage('xx')
    })
    expect(screen.getByLabelText('sample')).toHaveTextContent('Home')
  })
})
