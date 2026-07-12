import { describe, expect, it } from 'vitest'

import { getPublishedServiceState } from './serviceSchedule'

describe('published service schedule', () => {
  it('expects Sunday Line 3 service in the afternoon', () => {
    expect(getPublishedServiceState(new Date('2026-07-12T15:50:00.000Z'))).toBe('expected')
  })

  it('does not call the daytime weekday window service overnight', () => {
    expect(getPublishedServiceState(new Date('2026-07-13T03:00:00.000Z'))).toBe('not-scheduled')
  })
})
