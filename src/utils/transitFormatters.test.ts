import { describe, expect, it } from 'vitest'

import type { BusPrediction } from '../types/tracking'
import { buildBusPopup, formatBusSignal, formatEta } from './transitFormatters'

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

    const popup = buildBusPopup(306 as unknown as string, prediction, 'Línea 2', 'moving', 'high')

    expect(popup).toContain('Autobús #306')
    expect(popup).toContain('>Alta<')
  })

  it('shows the direction reported by the service', () => {
    const prediction: BusPrediction = {
      station: {
        id: '359',
        name: 'TXOPOETA',
        lat: 43,
        lng: -3,
        position: [-3, 43],
      },
      minutes: 1,
      lineRef: 'L.1 LEIOA',
    }

    expect(
      buildBusPopup(
        '306',
        prediction,
        'LINEA 1 SAN BARTOLOME',
        'moving',
        'high',
        0,
        'METRO LAMIAKO (DIRECCION AMAIA)',
      ),
    ).toContain('Hacia METRO LAMIAKO (DIRECCION AMAIA)')
  })

  it('makes stale upstream information visible to the user', () => {
    const prediction: BusPrediction = {
      station: {
        id: '358',
        name: 'IPARRAGIRRE',
        lat: 43,
        lng: -3,
        position: [-3, 43],
      },
      minutes: 1,
      lineRef: 'L.2 LEIOA',
    }

    expect(buildBusPopup('306', prediction, 'Línea 2', 'ambiguous', 'low', 180)).toContain(
      'sin cambios desde hace 3 min',
    )
  })

  it('shares ETA and confidence wording across the map UI', () => {
    expect(formatEta(0)).toBe('Llegando')
    expect(formatEta(3)).toBe('3 min')
    expect(formatBusSignal('high', 30)).toBe('Actualizado')
    expect(formatBusSignal('medium', 30)).toBe('Aproximado')
    expect(formatBusSignal('high', 180)).toBe('Información antigua')
  })
})
