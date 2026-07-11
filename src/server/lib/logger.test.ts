import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger } from './logger'

function lastPayload(spy: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const call = spy.mock.calls.at(-1)?.[0]
  if (typeof call !== 'string') throw new Error('console was not called with a string')
  return JSON.parse(call) as Record<string, unknown>
}

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('emits one valid JSON line with level/msg/ts', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('hello world')
    expect(spy).toHaveBeenCalledTimes(1)
    const payload = lastPayload(spy)
    expect(payload).toMatchObject({ level: 'info', msg: 'hello world' })
    expect(typeof payload.ts).toBe('string')
  })

  it('merges context fields flat into the line', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('test', { foo: 42, bar: 'baz' })
    expect(lastPayload(spy)).toMatchObject({ level: 'warn', msg: 'test', foo: 42, bar: 'baz' })
  })

  it('suppresses calls below the LOG_LEVEL threshold', () => {
    vi.stubEnv('LOG_LEVEL', 'warn')
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.debug('nope')
    logger.info('also nope')
    expect(debugSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
  })

  it('error() merges Error fields when one is passed', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('failed', { requestId: 'r1' }, new Error('boom'))
    const payload = lastPayload(spy)
    expect(payload).toMatchObject({
      level: 'error',
      msg: 'failed',
      requestId: 'r1',
      errName: 'Error',
      errMessage: 'boom',
    })
    expect(typeof payload.errStack).toBe('string')
  })
})
