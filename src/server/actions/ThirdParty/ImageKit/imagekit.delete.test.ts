import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { deleteImageKitAssets } from './imagekit.delete'

const realFetch = globalThis.fetch

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const spy = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(input.toString(), init)),
  )
  globalThis.fetch = spy as unknown as typeof fetch
  return spy
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.stubEnv('IMAGEKIT_PRIVATE_KEY', 'private_test_key')
})

afterEach(() => {
  globalThis.fetch = realFetch
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('deleteImageKitAssets', () => {
  it('makes no network calls for an empty or blank list', async () => {
    const spy = mockFetch(() => json([]))
    expect(await deleteImageKitAssets([])).toEqual({ deleted: 0, failed: [] })
    expect(await deleteImageKitAssets(['', '   '])).toEqual({ deleted: 0, failed: [] })
    expect(spy).not.toHaveBeenCalled()
  })

  it('splits a nested path into a folder scope and a name query', async () => {
    let searchUrl = ''
    mockFetch((url) => {
      if (!url.includes('batch')) {
        searchUrl = url
        return json([{ fileId: 'f1', filePath: '/posts/2026/abc_1.jpg' }])
      }
      return json({ successfullyDeletedFileIds: ['f1'] })
    })

    const res = await deleteImageKitAssets(['posts/2026/abc_1.jpg'])

    const parsed = new URL(searchUrl)
    expect(parsed.searchParams.get('path')).toBe('/posts/2026')
    expect(parsed.searchParams.get('searchQuery')).toBe('name="abc_1.jpg"')
    expect(parsed.searchParams.get('type')).toBe('file')
    expect(res).toEqual({ deleted: 1, failed: [] })
  })

  it('sends Basic auth with the private key and a trailing colon', async () => {
    let auth = ''
    mockFetch((url, init) => {
      const headers = new Headers(init?.headers)
      auth = headers.get('Authorization') ?? ''
      if (!url.includes('batch')) return json([{ fileId: 'f1', filePath: '/a.jpg' }])
      return json({ successfullyDeletedFileIds: ['f1'] })
    })

    await deleteImageKitAssets(['a.jpg'])
    expect(auth).toBe(`Basic ${btoa('private_test_key:')}`)
  })

  it('ignores a same-name file that lives in a different folder', async () => {
    mockFetch((url) => {
      if (!url.includes('batch')) {
        // ImageKit answered with a file whose path is not the one we asked for.
        return json([{ fileId: 'wrong', filePath: '/other/abc.jpg' }])
      }
      throw new Error('must not attempt a delete without a confirmed match')
    })

    expect(await deleteImageKitAssets(['posts/abc.jpg']))
      .toEqual({ deleted: 0, failed: ['posts/abc.jpg'] })
  })

  it('treats a 207 partial success as success for the ids that went through', async () => {
    mockFetch((url) => {
      if (!url.includes('batch')) return json([{ fileId: 'f1', filePath: '/a.jpg' }])
      return json({ successfullyDeletedFileIds: ['f1'], errors: [{ fileId: 'f2' }] }, 207)
    })
    expect((await deleteImageKitAssets(['a.jpg'])).deleted).toBe(1)
  })

  it('never throws when the API errors, so a purge is not aborted', async () => {
    mockFetch(() => json({ message: 'boom' }, 500))
    await expect(deleteImageKitAssets(['a.jpg'])).resolves.toEqual({
      deleted: 0, failed: ['a.jpg'],
    })
  })

  it('never throws when fetch itself rejects', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down'))) as unknown as typeof fetch
    await expect(deleteImageKitAssets(['a.jpg'])).resolves.toEqual({
      deleted: 0, failed: ['a.jpg'],
    })
  })

  it('reports every path as failed when the private key is missing', async () => {
    vi.stubEnv('IMAGEKIT_PRIVATE_KEY', '')
    const spy = mockFetch(() => json([]))
    expect(await deleteImageKitAssets(['a.jpg'])).toEqual({ deleted: 0, failed: ['a.jpg'] })
    expect(spy).not.toHaveBeenCalled()
  })

  it('de-duplicates repeated paths', async () => {
    let searches = 0
    mockFetch((url) => {
      if (!url.includes('batch')) { searches++; return json([{ fileId: 'f1', filePath: '/a.jpg' }]) }
      return json({ successfullyDeletedFileIds: ['f1'] })
    })
    await deleteImageKitAssets(['a.jpg', 'a.jpg', '/a.jpg'])
    expect(searches).toBe(1)
  })
})
