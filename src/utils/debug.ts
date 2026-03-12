export function isDebugEnabled(): boolean {
  if (import.meta.env.DEV) {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get('debug') === '1'
}
