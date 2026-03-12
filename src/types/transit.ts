export type LngLat = [number, number]

export interface Station {
  id: string
  name: string
  lat: number
  lng: number
  position: LngLat
}

export interface LineStop {
  id: string
  name: string
  lat: number
  lng: number
  position: LngLat
  sequence: number
}

export interface Line {
  ref: string
  name: string
  encodedPath: string
  stops: LineStop[]
}

export interface Arrival {
  busId: string
  minutes: number
  lineRef: string
}

export interface Topology {
  lines: Line[]
  stations: Station[]
}
