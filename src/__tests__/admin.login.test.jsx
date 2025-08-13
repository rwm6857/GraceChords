import { describe, test, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('Admin login', () => {
    beforeAll(() => {
      HTMLCanvasElement.prototype.getContext = () => ({
        measureText: () => ({ width: 0, actualBoundingBoxAscent: 0 })
      })
    })

  test('login fails with incorrect password', async () => {
    import.meta.env.VITE_ADMIN_PW = 'secret'
    const { default: Admin } = await import('../components/Admin.jsx')
    render(<Admin />)

    const input = screen.getByPlaceholderText(/password/i)
    await userEvent.type(input, 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))

    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument()
  })

  test('login succeeds with correct password', async () => {
    import.meta.env.VITE_ADMIN_PW = 'secret'
    const { default: Admin } = await import('../components/Admin.jsx')
    render(<Admin />)

    const input = screen.getByPlaceholderText(/password/i)
    await userEvent.type(input, 'secret')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))

    expect(await screen.findByRole('button', { name: /add to drafts/i })).toBeInTheDocument()
  })
})

