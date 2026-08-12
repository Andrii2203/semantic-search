import { beforeEach, describe, expect, test } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ItemList } from './ItemList'
import { useUIStore } from '../stores/uiStore'
import { captureRequests, renderWithProviders } from '../test/render'

const SEARCH_RESPONSE = {
  results: [
    {
      item: { id: 'item-1', source: 'hn', metadata: { title: 'Async Rust in production' } },
      score: 0.82,
      scores: { bm25Rank: 1, semanticRank: 3, rrfScore: 0.031 },
    },
  ],
  stats: { totalDocuments: 1 },
}

function stubApi({ groqConfigured = true } = {}) {
  return captureRequests({
    '/api/items': { items: [], nextCursor: null },
    '/api/health/full': {
      status: groqConfigured ? 'healthy' : 'degraded',
      modules: { groq: { ok: groqConfigured, status: groqConfigured ? 'ok' : 'warning' } },
    },
    '/api/search': SEARCH_RESPONSE,
  })
}

function searchRequests(requests) {
  return requests.filter((request) => request.url.startsWith('/api/search'))
}

describe('client/src/components/ItemList.jsx', () => {
  beforeEach(() => {
    useUIStore.setState({
      currentView: 'search',
      searchQuery: 'rust async',
      searchResults: [],
      selectedItemId: null,
      isSearching: false,
    })
  })

  test('searches without the HyDE flag while the switch is off', async () => {
    const requests = stubApi()
    renderWithProviders(<ItemList />)

    await userEvent.click(screen.getByRole('button', { name: /run search/i }))

    await waitFor(() => expect(searchRequests(requests)).toHaveLength(1))
    expect(searchRequests(requests)[0].body.useHyde).toBeFalsy()
  })

  test('sends the HyDE flag when the user turns HyDE on', async () => {
    const requests = stubApi()
    renderWithProviders(<ItemList />)

    await waitFor(() => expect(screen.getByRole('button', { name: /hyde/i })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: /hyde/i }))
    await userEvent.click(screen.getByRole('button', { name: /run search/i }))

    await waitFor(() => expect(searchRequests(requests)).toHaveLength(1))
    expect(searchRequests(requests)[0].body.useHyde).toBe(true)
  })

  test('reranks the current results when the user asks for it', async () => {
    const requests = stubApi()
    renderWithProviders(<ItemList />)

    await userEvent.click(screen.getByRole('button', { name: /run search/i }))
    await screen.findByText('Async Rust in production')
    await userEvent.click(screen.getByRole('button', { name: /rerank/i }))

    await waitFor(() => expect(searchRequests(requests)).toHaveLength(2))
    expect(searchRequests(requests)[1].body.useReranker).toBe(true)
  })

  test('hides the ranking numbers until the user asks for them', async () => {
    stubApi()
    renderWithProviders(<ItemList />)

    await userEvent.click(screen.getByRole('button', { name: /run search/i }))
    await screen.findByText('Async Rust in production')

    expect(screen.queryByText(/bm25/i)).not.toBeInTheDocument()
  })

  test('shows bm25, semantic and fused ranking numbers when scores are on', async () => {
    stubApi()
    renderWithProviders(<ItemList />)

    await userEvent.click(screen.getByRole('button', { name: /run search/i }))
    await screen.findByText('Async Rust in production')
    await userEvent.click(screen.getByRole('button', { name: /scores/i }))

    expect(await screen.findByText(/bm25 1/i)).toBeInTheDocument()
    expect(screen.getByText(/semantic 3/i)).toBeInTheDocument()
    expect(screen.getByText(/rrf 0\.031/i)).toBeInTheDocument()
  })

  test('disables the paid controls when no Groq key is configured', async () => {
    stubApi({ groqConfigured: false })
    renderWithProviders(<ItemList />)

    await waitFor(() => expect(screen.getByRole('button', { name: /hyde/i })).toBeDisabled())
  })

  test('keeps the paid controls available when a Groq key is configured', async () => {
    stubApi({ groqConfigured: true })
    renderWithProviders(<ItemList />)

    await waitFor(() => expect(screen.getByRole('button', { name: /hyde/i })).toBeEnabled())
  })
})
