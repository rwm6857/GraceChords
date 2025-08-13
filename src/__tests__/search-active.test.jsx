import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import App from '../App.jsx'

test('enter on search opens first result', async () => {
  render(
    <HashRouter>
      <App />
    </HashRouter>
  )

  const input = await screen.findByLabelText(/search/i)
  await userEvent.type(input, 'amazing')

  const firstLink = await screen.findByRole('link', { name: /amazing grace/i })
  expect(firstLink.closest('.card')).toHaveClass('active')

  await userEvent.type(input, '{enter}')

  await screen.findByRole('heading', { name: /amazing grace/i })
})

