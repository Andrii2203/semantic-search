import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'

export function renderWithProviders(ui) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function readBody(body) {
  if (!body) return null

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const fields = { files: [] }
    for (const [key, value] of body.entries()) {
      if (value instanceof File) fields.files.push(value.name)
      else fields[key] = value
    }
    return fields
  }

  return JSON.parse(body)
}

function buildResponse(responses, url) {
  const match = Object.keys(responses).find((key) => url.startsWith(key))
  return { ok: true, status: 200, json: async () => (match ? responses[match] : {}) }
}

export function captureRequests(responses = {}) {
  const requests = []

  globalThis.fetch = vi.fn(async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET', body: readBody(options.body) })
    return buildResponse(responses, url)
  })

  return requests
}

export function captureRequestsManually(responses = {}) {
  const requests = []
  const pending = []

  globalThis.fetch = vi.fn((url, options = {}) => {
    requests.push({ url, method: options.method || 'GET', body: readBody(options.body) })
    return new Promise((resolve) => pending.push(() => resolve(buildResponse(responses, url))))
  })

  return {
    requests,
    respondNext: () => {
      const next = pending.shift()
      if (next) next()
    },
  }
}
