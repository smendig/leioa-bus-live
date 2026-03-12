export const MAP_DEFAULT_CENTER = {
  lat: 43.33,
  lng: -2.99,
  zoom: 14,
} as const

export const MAP_POLL_INTERVAL_MS = 15000
export const MAP_BOOTSTRAP_POLL_DELAYS_MS = [5000, 10000] as const
export const MAP_BOOTSTRAP_DRIFT_SAMPLE_COUNT = 2
export const MAP_BOOTSTRAP_STATUS_SAMPLE_COUNT = MAP_BOOTSTRAP_POLL_DELAYS_MS.length + 1
export const GHOST_BUS_GRACE_MINUTES = 3
export const ELAPSED_TIMEOUT_EXTRA_MINUTES = 4
export const LOW_ETA_PLATEAU_MAX_MINUTES = 1
export const LOW_ETA_PLATEAU_WARNING_POLLS = 24
export const LOW_ETA_GHOST_POLLS = 60
export const BUS_SPEED_KM_PER_MINUTE = 0.25
export const SAME_STOP_OVERLAP_PENALTY = 0.05
export const LOW_ETA_SAME_STOP_OVERLAP_PENALTY = 0.16

export type TrackingHotspotPrior = {
  label: string
  basePenalty: number
  lowEtaPenalty: number
  overlapPenalty: number
}

export const TRACKING_HOTSPOT_PRIORS: Record<string, TrackingHotspotPrior> = {
  'L.1 LEIOA:342': {
    label: 'L.1 / METRO LAMIAKO',
    basePenalty: 0.08,
    lowEtaPenalty: 0.12,
    overlapPenalty: 0.16,
  },
}

export const LINE_COLORS: Record<string, string> = {
  'L.1 LEIOA': '#004e4d',
  'L.2 LEIOA': '#009d9a',
  'L.UNICA': '#d72638',
}
