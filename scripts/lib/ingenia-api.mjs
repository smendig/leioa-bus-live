import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import CryptoJS from 'crypto-js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
loadEnvFile(path.join(REPO_ROOT, '.env.local'))
loadEnvFile(path.join(REPO_ROOT, '.env'))

const API_URL = getRequiredEnv(['BUS_API_URL', 'VITE_BUS_API_URL']).replace(/\/+$/, '')
const KEY = CryptoJS.enc.Utf8.parse(getRequiredEnv(['BUS_AES_KEY', 'VITE_BUS_AES_KEY']))
const IV = CryptoJS.enc.Utf8.parse(getRequiredEnv(['BUS_AES_IV', 'VITE_BUS_AES_IV']))
const IV_B64 = CryptoJS.enc.Base64.stringify(IV)
const BUS_GROUP_ID = getRequiredIntegerEnv(['BUS_GROUP_ID', 'VITE_BUS_GROUP_ID'])

const BASE_PAYLOAD = {
  ApiUser: getRequiredEnv(['BUS_API_USER', 'VITE_BUS_API_USER']),
  ApiPassword: getRequiredEnv(['BUS_API_PASSWORD', 'VITE_BUS_API_PASSWORD']),
  Lang: getRequiredEnv(['BUS_LANG', 'VITE_BUS_LANG']),
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const fileContent = fs.readFileSync(filePath, 'utf8')
  for (const line of fileContent.split(/\r?\n/)) {
    const trimmedLine = line.trim()
    if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    if (!key || process.env[key] !== undefined) {
      continue
    }

    let value = trimmedLine.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

function getRequiredEnv(names) {
  for (const name of names) {
    const value = process.env[name]
    if (value && value.trim().length > 0) {
      return value.trim()
    }
  }

  throw new Error(`Missing required environment variable. Set one of: ${names.join(', ')}`)
}

function getRequiredIntegerEnv(names) {
  const value = getRequiredEnv(names)
  const parsedValue = Number.parseInt(value, 10)
  if (!Number.isFinite(parsedValue)) {
    throw new Error(`Invalid integer environment variable value "${value}" for: ${names.join(', ')}`)
  }

  return parsedValue
}

function encryptPayload(data) {
  const payload = { ...BASE_PAYLOAD, ...data }
  const jsonStr = JSON.stringify(payload).replace(/":"/g, '":"').replace(/","/g, '","')

  return CryptoJS.AES.encrypt(jsonStr, KEY, {
    iv: IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString()
}

function decryptPayload(encryptedB64) {
  const decrypted = CryptoJS.AES.decrypt(encryptedB64, KEY, {
    iv: IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })

  return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8))
}

export async function makeRequest(endpoint, payload = {}) {
  const params = new URLSearchParams({
    jsonInput: encryptPayload(payload),
    InitialVector: IV_B64,
    _: Date.now().toString(),
  })

  const response = await fetch(`${API_URL}${endpoint}?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed for ${endpoint}: ${response.status}`)
  }

  let responseText = await response.text()
  if (responseText.startsWith('"') && responseText.endsWith('"')) {
    responseText = responseText.slice(1, -1)
  }

  return decryptPayload(responseText)
}

export async function fetchTopology() {
  const [linesData, stationsData] = await Promise.all([
    makeRequest('/Lines', { search: { IdGroup: BUS_GROUP_ID } }),
    makeRequest('/Stations', { search: { IdGroup: BUS_GROUP_ID } }),
  ])

  return {
    fetchedAt: new Date().toISOString(),
    lines: linesData?.Lines ?? [],
    stations: stationsData?.Stops ?? [],
  }
}

export async function fetchAllArrivals(stations) {
  const snapshots = await Promise.all(
    stations.map(async (station) => {
      const data = await makeRequest('/ArrivalTime', { spRef: station.spRef })

      return {
        station: {
          spRef: station.spRef,
          spName: station.spName,
          lat: station.lat,
          lon: station.lon,
        },
        arrivals: data?.Arrivals ?? [],
      }
    }),
  )

  return snapshots
}
