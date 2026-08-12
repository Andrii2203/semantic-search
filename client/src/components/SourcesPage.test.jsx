import { describe, expect, test } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SourcesPage } from './SourcesPage'
import { captureRequests, renderWithProviders } from '../test/render'

const SOURCES = {
  sources: [
    { id: 's1', type: 'builtin', url: 'hn', label: 'hn', enabled: true },
    { id: 's2', type: 'rss', url: 'https://example.test/feed.xml', label: 'Example blog', enabled: true },
    { id: 's3', type: 'rss', url: 'https://quiet.test/feed.xml', label: 'Quiet blog', enabled: false },
  ],
}

function stubSources() {
  return captureRequests({ '/api/sources': SOURCES })
}

function requestsTo(requests, method) {
  return requests.filter((request) => request.method === method && request.url.startsWith('/api/sources'))
}

describe('client/src/components/SourcesPage.jsx', () => {
  test('lists the sources of the person', async () => {
    stubSources()
    renderWithProviders(<SourcesPage />)

    expect(await screen.findByText('Example blog')).toBeInTheDocument()
    expect(screen.getByText('Quiet blog')).toBeInTheDocument()
    expect(screen.getByText('hn')).toBeInTheDocument()
  })

  test('marks a source that is switched off', async () => {
    stubSources()
    renderWithProviders(<SourcesPage />)

    const quiet = await screen.findByRole('button', { name: /switch on quiet blog/i })
    expect(quiet).toBeInTheDocument()
  })

  test('adds a feed by url', async () => {
    const requests = stubSources()
    renderWithProviders(<SourcesPage />)
    await screen.findByText('Example blog')

    await userEvent.type(screen.getByLabelText(/feed url/i), 'https://new.test/rss')
    await userEvent.click(screen.getByRole('button', { name: /^add feed$/i }))

    await waitFor(() => expect(requestsTo(requests, 'POST')).toHaveLength(1))
    expect(requestsTo(requests, 'POST')[0].body.url).toBe('https://new.test/rss')
  })

  test('switches a source off', async () => {
    const requests = stubSources()
    renderWithProviders(<SourcesPage />)

    await userEvent.click(await screen.findByRole('button', { name: /switch off example blog/i }))

    await waitFor(() => expect(requestsTo(requests, 'POST')).toHaveLength(1))
    const toggle = requestsTo(requests, 'POST')[0]
    expect(toggle.url).toBe('/api/sources/s2/toggle')
    expect(toggle.body.enabled).toBe(false)
  })

  test('removes a source', async () => {
    const requests = stubSources()
    renderWithProviders(<SourcesPage />)

    await userEvent.click(await screen.findByRole('button', { name: /remove example blog/i }))

    await waitFor(() => expect(requestsTo(requests, 'DELETE')).toHaveLength(1))
    expect(requestsTo(requests, 'DELETE')[0].url).toBe('/api/sources/s2')
  })

  test('does not offer to remove a built in source', async () => {
    stubSources()
    renderWithProviders(<SourcesPage />)
    await screen.findByText('Example blog')

    expect(screen.queryByRole('button', { name: /remove hn/i })).not.toBeInTheDocument()
  })
})
