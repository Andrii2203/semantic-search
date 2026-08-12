import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'

export function renderWithProviders(ui) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

export function captureRequests(responses = {}) {
  const requests = []

  globalThis.fetch = vi.fn(async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null
    requests.push({ url, method: options.method || 'GET', body })

    const match = Object.keys(responses).find((key) => url.startsWith(key))
    return {
      ok: true,
      status: 200,
      json: async () => (match ? responses[match] : {}),
    }
  })

  return requests
}
