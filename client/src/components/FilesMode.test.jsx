import { describe, expect, test } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilesMode } from './FilesMode'
import { captureRequests, captureRequestsManually, renderWithProviders } from '../test/render'

function pdf(name) {
  return new File(['%PDF-1.4 fake'], name, { type: 'application/pdf' })
}

const ONE_FILE_ACCEPTED = {
  success: true,
  processed: 1,
  failed: 0,
  items: [{ id: 'doc-1' }],
}

function uploadRequests(requests) {
  return requests.filter((request) => request.url.startsWith('/api/upload'))
}

describe('client/src/components/FilesMode.jsx', () => {
  test('uploads every file of a batch under one batch id', async () => {
    const requests = captureRequests({ '/api/upload': ONE_FILE_ACCEPTED })
    renderWithProviders(<FilesMode />)

    await userEvent.upload(screen.getByLabelText(/choose pdfs/i), [
      pdf('a.pdf'),
      pdf('b.pdf'),
      pdf('c.pdf'),
    ])

    await waitFor(() => expect(uploadRequests(requests)).toHaveLength(3))
    const batchIds = uploadRequests(requests).map((request) => request.body.batchId)
    expect(batchIds[0]).toBeTruthy()
    expect(new Set(batchIds).size).toBe(1)
  })

  test('sends one file per request so a batch is never held whole in memory', async () => {
    const requests = captureRequests({ '/api/upload': ONE_FILE_ACCEPTED })
    renderWithProviders(<FilesMode />)

    await userEvent.upload(screen.getByLabelText(/choose pdfs/i), [pdf('a.pdf'), pdf('b.pdf')])

    await waitFor(() => expect(uploadRequests(requests)).toHaveLength(2))
    expect(uploadRequests(requests).map((request) => request.body.files)).toEqual([
      ['a.pdf'],
      ['b.pdf'],
    ])
  })

  test('reports how many files of the batch are done while it works', async () => {
    const { respondNext } = captureRequestsManually({ '/api/upload': ONE_FILE_ACCEPTED })
    renderWithProviders(<FilesMode />)

    await userEvent.upload(screen.getByLabelText(/choose pdfs/i), [
      pdf('a.pdf'),
      pdf('b.pdf'),
      pdf('c.pdf'),
    ])

    expect(await screen.findByText(/processing 0 of 3/i)).toBeInTheDocument()

    respondNext()
    expect(await screen.findByText(/processing 1 of 3/i)).toBeInTheDocument()

    respondNext()
    expect(await screen.findByText(/processing 2 of 3/i)).toBeInTheDocument()
  })

  test('returns to the idle label and reports the total once the batch finishes', async () => {
    captureRequests({ '/api/upload': ONE_FILE_ACCEPTED })
    renderWithProviders(<FilesMode />)

    await userEvent.upload(screen.getByLabelText(/choose pdfs/i), [pdf('a.pdf'), pdf('b.pdf')])

    expect(await screen.findByText(/\+2 added/i)).toBeInTheDocument()
    expect(screen.getByText(/choose pdfs/i)).toBeInTheDocument()
  })
})
