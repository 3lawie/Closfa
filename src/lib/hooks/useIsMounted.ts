import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}
const onClient = () => true
const onServer = () => false

/**
 * False during SSR and on the very first client render, true afterwards.
 *
 * Every portal-based overlay needs this: `createPortal` requires a real
 * `document`, and gating on `typeof document === 'undefined'` produces a
 * guaranteed server/client markup mismatch for any component mounted
 * unconditionally with only an `isOpen` flag toggling.
 *
 * Previously each of them carried its own `useState(false)` +
 * `useEffect(() => setMounted(true), [])`. That works, but setting state
 * synchronously inside an effect schedules a second render pass on mount for
 * every overlay in the tree. useSyncExternalStore encodes exactly the same
 * intent — a value that differs between server and client — with one render.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, onClient, onServer)
}
