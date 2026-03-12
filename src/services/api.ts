import CryptoJS from 'crypto-js'

import type { Arrival, Line, LineStop, Station, Topology } from '../types/transit'

const API_URL = getRequiredEnv('VITE_BUS_API_URL').replace(/\/+$/, '')
const KEY = CryptoJS.enc.Utf8.parse(getRequiredEnv('VITE_BUS_AES_KEY'))
const IV = CryptoJS.enc.Utf8.parse(getRequiredEnv('VITE_BUS_AES_IV'))
const IV_B64 = CryptoJS.enc.Base64.stringify(IV)
const BUS_GROUP_ID = getRequiredGroupId()

const BASE_PAYLOAD = {
  ApiUser: getRequiredEnv('VITE_BUS_API_USER'),
  ApiPassword: getRequiredEnv('VITE_BUS_API_PASSWORD'),
  Lang: getRequiredEnv('VITE_BUS_LANG'),
}

type ApiPayload = Record<string, unknown>

interface ApiResponseBase {
  Error: string
}

interface RawStation {
  spRef: string
  spName: string
  lat: string
  lon: string
}

interface RawLine {
  LRef: string
  LName: string
  EncodedPath: string
  Directions?: RawDirection[]
}

interface RawDirection {
  stops?: RawStation[]
}

interface RawArrival {
  IdBus: string
  Minutes: string
  LRef: string
  LName: string
}

interface LinesResponse extends ApiResponseBase {
  Lines: RawLine[]
}

interface StationsResponse extends ApiResponseBase {
  Stops: RawStation[]
}

interface ArrivalsResponse extends ApiResponseBase {
  Arrivals: RawArrival[]
}

function getRequiredEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value.trim()
}

function getRequiredGroupId(): number {
  const value = getRequiredEnv('VITE_BUS_GROUP_ID')
  const parsedValue = Number.parseInt(value, 10)
  if (!Number.isFinite(parsedValue)) {
    throw new Error(`Invalid VITE_BUS_GROUP_ID: "${value}"`)
  }

  return parsedValue
}

function encryptPayload(data: ApiPayload): string {
  const payload = { ...BASE_PAYLOAD, ...data }
  const jsonStr = JSON.stringify(payload).replace(/":"/g, '":"').replace(/","/g, '","')

  const encrypted = CryptoJS.AES.encrypt(jsonStr, KEY, {
    iv: IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })

  return encrypted.toString()
}

function decryptPayload<T>(encryptedB64: string): T | null {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedB64, KEY, {
      iv: IV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    })
    const jsonStr = decrypted.toString(CryptoJS.enc.Utf8)
    return JSON.parse(jsonStr) as T
  } catch (error) {
    console.error('Failed to decrypt API response', error)
    return null
  }
}

async function makeRequest<T>(endpoint: string, payload: ApiPayload = {}): Promise<T | null> {
  const encPayload = encryptPayload(payload)
  const params = new URLSearchParams({
    jsonInput: encPayload,
    InitialVector: IV_B64,
    _: Date.now().toString(),
  })

  try {
    const response = await fetch(`${API_URL}${endpoint}?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    let responseText = await response.text()
    if (responseText.startsWith('"') && responseText.endsWith('"')) {
      responseText = responseText.slice(1, -1)
    }

    return decryptPayload<T>(responseText)
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error)
    return null
  }
}

export async function getTopology(): Promise<Topology> {
  const [linesData, stationsData] = await Promise.all([
    makeRequest<LinesResponse>('/Lines', { search: { IdGroup: BUS_GROUP_ID } }),
    makeRequest<StationsResponse>('/Stations', { search: { IdGroup: BUS_GROUP_ID } }),
  ])

  if (linesData?.Error !== '0' || stationsData?.Error !== '0') {
    throw new Error('No se ha podido obtener la topología de Leioa')
  }

  return {
    lines: linesData.Lines.map(normalizeLine),
    stations: stationsData.Stops.map(normalizeStation),
  }
}

export async function getArrivals(spRef: string): Promise<Arrival[]> {
  const data = await makeRequest<ArrivalsResponse>('/ArrivalTime', { spRef })
  if (data?.Error !== '0') {
    return []
  }

  return data.Arrivals.map(normalizeArrival)
}

function normalizeStation(station: RawStation): Station {
  const lat = Number.parseFloat(station.lat)
  const lng = Number.parseFloat(station.lon)

  return {
    id: station.spRef,
    name: station.spName,
    lat,
    lng,
    position: [lng, lat],
  }
}

function normalizeLine(line: RawLine): Line {
  return {
    ref: line.LRef,
    name: line.LName,
    encodedPath: line.EncodedPath,
    stops: normalizeLineStops(line.Directions?.[0]?.stops ?? []),
  }
}

function normalizeArrival(arrival: RawArrival): Arrival {
  return {
    busId: arrival.IdBus,
    minutes: Number.parseInt(arrival.Minutes, 10),
    lineRef: arrival.LRef,
  }
}

function normalizeLineStops(stops: RawStation[]): LineStop[] {
  return stops.map((stop, index) => {
    const lat = Number.parseFloat(stop.lat)
    const lng = Number.parseFloat(stop.lon)

    return {
      id: stop.spRef,
      name: stop.spName,
      lat,
      lng,
      position: [lng, lat],
      sequence: index,
    }
  })
}
