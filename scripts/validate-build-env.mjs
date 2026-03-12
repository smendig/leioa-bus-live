import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const REQUIRED_ENV_NAMES = [
  'VITE_BUS_API_URL',
  'VITE_BUS_API_USER',
  'VITE_BUS_API_PASSWORD',
  'VITE_BUS_AES_KEY',
  'VITE_BUS_AES_IV',
]

loadEnvFile(path.resolve('.env'))
loadEnvFile(path.resolve('.env.local'))

const missingEnvNames = REQUIRED_ENV_NAMES.filter((name) => {
  const value = process.env[name]
  return !value || value.trim().length === 0
})

if (missingEnvNames.length > 0) {
  process.stderr.write(
    [
      'Missing required build environment variables:',
      ...missingEnvNames.map((name) => `- ${name}`),
    ].join('\n'),
  )
  process.stderr.write('\n')
  process.exit(1)
}

process.stdout.write('Build environment variables look good.\n')

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
