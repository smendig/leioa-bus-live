export type PublishedServiceState = 'expected' | 'not-scheduled'

const MADRID_TIME_ZONE = 'Europe/Madrid'

/**
 * Published Lejoan Busa windows. This is only a service-availability prior: the
 * ArrivalTime endpoint remains the source of live vehicle data.
 */
export function getPublishedServiceState(date: Date): PublishedServiceState {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MADRID_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const weekday = values.weekday
  const minutes = Number(values.hour) * 60 + Number(values.minute)

  if (
    weekday === 'Mon' ||
    weekday === 'Tue' ||
    weekday === 'Wed' ||
    weekday === 'Thu' ||
    weekday === 'Fri'
  ) {
    return inWindow(minutes, 7 * 60, 22 * 60 + 30) ? 'expected' : 'not-scheduled'
  }

  if (weekday === 'Sat') {
    return inWindow(minutes, 9 * 60, 15 * 60 + 30) || inWindow(minutes, 17 * 60 + 25, 24 * 60)
      ? 'expected'
      : 'not-scheduled'
  }

  return inWindow(minutes, 11 * 60 + 25, 14 * 60 + 55) ||
    inWindow(minutes, 16 * 60 + 55, 21 * 60 + 55)
    ? 'expected'
    : 'not-scheduled'
}

function inWindow(value: number, start: number, end: number): boolean {
  return value >= start && value <= end
}
