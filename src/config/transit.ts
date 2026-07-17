export const MAP_DEFAULT_CENTER = {
  lat: 43.33,
  lng: -2.99,
  zoom: 14,
} as const

export const TRANSIT_PUBLIC_GROUP_ID = 13
export const TRANSIT_PUBLIC_LANG = 'ES'

export const MAP_POLL_INTERVAL_MS = 15000
export const MAP_IDLE_POLL_INTERVAL_MS = 30000
export const MAP_NO_SERVICE_POLL_INTERVAL_MS = 60000
// One follow-up sample is enough to establish drift; normal polling continues at 15 s.
export const MAP_BOOTSTRAP_POLL_DELAYS_MS = [7000] as const
export const MAP_BOOTSTRAP_DRIFT_SAMPLE_COUNT = 2
export const MAP_BOOTSTRAP_STATUS_SAMPLE_COUNT = MAP_BOOTSTRAP_POLL_DELAYS_MS.length + 1
export const NO_SERVICE_LOCAL_TIMEZONE = 'Europe/Madrid'
export const NO_SERVICE_LOCAL_HOURS = [22, 23, 0, 1, 2, 3, 4, 5, 6] as const
export const NO_SERVICE_ZERO_ACTIVE_POLLS_NIGHT = 2
export const NO_SERVICE_ZERO_ACTIVE_POLLS_DAY = 4
export const PARTIAL_SNAPSHOT_WARNING_POLLS = 3
export const MISSING_BUS_GRACE_POLLS = 2
export const LOW_ETA_PLATEAU_MAX_MINUTES = 1
export const LOW_ETA_PLATEAU_WARNING_POLLS = 24
export const STALE_PREDICTION_SUPPRESSION_POLLS = 120
export const PREDICTION_STALE_WARNING_SECONDS = 180
export const SAME_STOP_OVERLAP_PENALTY = 0.05
export const LOW_ETA_SAME_STOP_OVERLAP_PENALTY = 0.16

const DEFAULT_LINE_COLOR = '#5c1810'

export interface TransitLinePresentation {
  ref: string
  shortLabel: string
  color: string
  displayName?: string
}

export const TRANSIT_LINES = [
  { ref: 'L.1 LEIOA', shortLabel: 'L1', color: '#004e4d' },
  { ref: 'L.2 LEIOA', shortLabel: 'L2', color: '#009d9a' },
  {
    ref: 'L.UNICA',
    shortLabel: 'L3',
    color: '#d72638',
    displayName: 'LINEA 3 (UNICA)',
  },
] as const satisfies readonly TransitLinePresentation[]

export function getTransitLinePresentation(lineRef: string): TransitLinePresentation {
  return (
    TRANSIT_LINES.find((line) => line.ref === lineRef) ?? {
      ref: lineRef,
      shortLabel: lineRef,
      color: DEFAULT_LINE_COLOR,
    }
  )
}

export function getTransitLineName(lineRef: string, sourceName: string): string {
  return getTransitLinePresentation(lineRef).displayName ?? sourceName
}
