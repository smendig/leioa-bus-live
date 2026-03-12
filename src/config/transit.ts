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
export const LOW_ETA_GHOST_POLLS = 10
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

// Median segment travel times derived from latest 53h capture analysis.
// Key format: "<previousStopId>-><nextStopId>" in minutes.
export const EMPIRICAL_SEGMENT_PRIORS_MINUTES: Record<string, number> = {
  '358->359': 1.55,
  '359->363': 1.07,
  '363->360': 1.8,
  '360->361': 2.62,
  '362->341': 1.28,
  '361->362': 1.03,
  '396->397': 0.8,
  '397->369': 1.05,
  '341->395': 4.03,
  '395->368': 2.88,
  '368->396': 3.33,
  '369->370': 4.33,
}

// Stop-level volatility priors from latest anomaly analysis.
// Key format: "<stopId>".
export const TRACKING_VOLATILE_STOP_PRIORS: Record<string, TrackingHotspotPrior> = {
  '341': {
    label: 'AREETA ANBULATORIOA volatility',
    basePenalty: 0.14,
    lowEtaPenalty: 0.12,
    overlapPenalty: 0.08,
  },
  '360': {
    label: 'METRO LEIOA AMAIA volatility',
    basePenalty: 0.1,
    lowEtaPenalty: 0.1,
    overlapPenalty: 0.06,
  },
  '369': {
    label: 'TORRESOLO TXORIERRI volatility',
    basePenalty: 0.1,
    lowEtaPenalty: 0.09,
    overlapPenalty: 0.08,
  },
  '358': {
    label: 'IPARRAGIRRE volatility',
    basePenalty: 0.06,
    lowEtaPenalty: 0.06,
    overlapPenalty: 0.04,
  },
  '363': {
    label: 'LIBANO AMAIA volatility',
    basePenalty: 0.06,
    lowEtaPenalty: 0.06,
    overlapPenalty: 0.04,
  },
  '364': {
    label: 'TXORIERRI volatility',
    basePenalty: 0.08,
    lowEtaPenalty: 0.08,
    overlapPenalty: 0.06,
  },
  '342': {
    label: 'METRO LAMIAKO volatility',
    basePenalty: 0.08,
    lowEtaPenalty: 0.1,
    overlapPenalty: 0.08,
  },
  '365': {
    label: 'INDEPENDENTZIA AMAIA volatility',
    basePenalty: 0.08,
    lowEtaPenalty: 0.08,
    overlapPenalty: 0.06,
  },
}

export const LINE_COLORS: Record<string, string> = {
  'L.1 LEIOA': '#004e4d',
  'L.2 LEIOA': '#009d9a',
  'L.UNICA': '#d72638',
}
