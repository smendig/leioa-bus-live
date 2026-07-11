import { describe, expect, it } from 'vitest'

import type { BusPrediction } from '../types/tracking'
import { buildBusPopup } from './transitFormatters'

describe('buildBusPopup', () => {
  it('renders defensively when the upstream bus identifier is numeric at runtime', () => {
    const prediction: BusPrediction = {
      station: {
        id: '358',
        name: 'IPARRAGIRRE',
        lat: 43,
        lng: -3,
        position: [-3, 43],
      },
      minutes: 2,
      lineRef: 'L.2 LEIOA',
    }

    expect(
      buildBusPopup(306 as unknown as string, prediction, 'Línea 2', 'moving', 'high'),
    ).toContain('Autobús #306')
  })
})
