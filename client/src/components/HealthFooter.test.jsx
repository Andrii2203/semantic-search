import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import { HealthFooter } from './HealthFooter'
import { captureRequests, renderWithProviders } from '../test/render'

function stubHealth(modules, status = 'degraded') {
  captureRequests({
    '/api/health/full': { status, modules, uptime: 42 },
  })
}

describe('client/src/components/HealthFooter.jsx', () => {
  test('names the module and its error in the tooltip when a module is degraded', async () => {
    stubHealth({
      db: { status: 'ok' },
      groq: { status: 'warning', error: 'Groq API key not configured' },
    })

    renderWithProviders(<HealthFooter />)

    const groq = await screen.findByTitle(/groq: Groq API key not configured/i)
    expect(groq).toBeInTheDocument()
  })

  test('names the module without an error when it is healthy', async () => {
    stubHealth({ db: { status: 'ok' } }, 'healthy')

    renderWithProviders(<HealthFooter />)

    const database = await screen.findByTitle(/^db: ok$/i)
    expect(database).toBeInTheDocument()
  })

  test('shows the overall status of the system', async () => {
    stubHealth({ db: { status: 'ok' } }, 'healthy')

    renderWithProviders(<HealthFooter />)

    expect(await screen.findByText('healthy')).toBeInTheDocument()
  })
})
