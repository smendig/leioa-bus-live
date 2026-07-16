import { describe, expect, it } from 'vitest'

import topologySnapshot from '../../public/topology.json'
import { isTopology } from './topology'

describe('isTopology', () => {
  it('accepts the bundled Leioa topology snapshot', () => {
    expect(isTopology(topologySnapshot)).toBe(true)
  })

  it('rejects empty or incomplete snapshots', () => {
    expect(isTopology({ lines: [], stations: [] })).toBe(false)
    expect(isTopology({ lines: [{}], stations: [{}] })).toBe(false)
  })
})
