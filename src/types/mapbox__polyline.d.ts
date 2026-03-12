declare module '@mapbox/polyline' {
  const polyline: {
    decode(encoded: string): [number, number][]
  }

  export default polyline
}
