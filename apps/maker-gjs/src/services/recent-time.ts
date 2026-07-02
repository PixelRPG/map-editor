/**
 * Human-friendly "when was this last opened" label for recent-project
 * rows ("today, 14:32" · "yesterday" · "3 days ago" · "last week" · a
 * plain date). Kept free of GTK imports so it is unit-testable on any
 * runtime; `nowMs` is injectable for deterministic tests.
 */
export function formatRelativeTime(thenMs: number, nowMs: number = Date.now()): string {
  const then = new Date(thenMs)
  const startOfDay = (ms: number) => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  const dayDiff = Math.round((startOfDay(nowMs) - startOfDay(thenMs)) / 86_400_000)

  // Same calendar day — or a future timestamp from clock skew, which we
  // deliberately show as "today" rather than something nonsensical.
  if (dayDiff <= 0) {
    const hh = String(then.getHours()).padStart(2, '0')
    const mm = String(then.getMinutes()).padStart(2, '0')
    return `today, ${hh}:${mm}`
  }
  if (dayDiff === 1) return 'yesterday'
  if (dayDiff < 7) return `${dayDiff} days ago`
  if (dayDiff < 14) return 'last week'
  if (dayDiff < 60) return `${Math.floor(dayDiff / 7)} weeks ago`
  // Older than that: an absolute date beats fuzzy math.
  return then.toISOString().slice(0, 10)
}
