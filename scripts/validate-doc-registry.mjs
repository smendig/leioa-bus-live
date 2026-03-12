import fs from 'node:fs/promises'
import path from 'node:path'

const DOCS_ROOT = path.resolve('docs')
const REGISTRY_PATH = path.join(DOCS_ROOT, 'document-registry.json')
const FRONT_MATTER_FIELDS = [
  'doc_id',
  'title',
  'category',
  'status',
  'read_priority',
  'topics',
  'canonical_for',
  'depends_on',
  'supersedes',
  'superseded_by',
]

async function main() {
  const registry = JSON.parse(await fs.readFile(REGISTRY_PATH, 'utf8'))
  const markdownEntries = registry.documents.filter((entry) => entry.format === 'markdown')
  const markdownRegistryByPath = new Map(markdownEntries.map((entry) => [entry.path, entry]))
  const markdownFiles = await listMarkdownFiles(DOCS_ROOT)
  const errors = []

  for (const filePath of markdownFiles) {
    const relativePath = path.relative(path.resolve('.'), filePath).replaceAll(path.sep, '/')
    const registryEntry = markdownRegistryByPath.get(relativePath)

    if (!registryEntry) {
      errors.push(`Markdown doc missing from registry: ${relativePath}`)
      continue
    }

    const content = await fs.readFile(filePath, 'utf8')
    const frontMatter = parseFrontMatter(content)
    if (!frontMatter) {
      errors.push(`Missing front matter: ${relativePath}`)
      continue
    }

    validateEntry(frontMatter, registryEntry, relativePath, errors)
  }

  for (const entry of markdownEntries) {
    const targetPath = path.resolve(entry.path)
    try {
      await fs.access(targetPath)
    } catch {
      errors.push(`Registry entry points to missing file: ${entry.path}`)
    }
  }

  if (errors.length > 0) {
    process.stderr.write(`${errors.map((error) => `- ${error}`).join('\n')}\n`)
    process.exit(1)
  }

  process.stdout.write('Documentation registry validation passed.\n')
}

async function listMarkdownFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }

  return files.sort()
}

function parseFrontMatter(content) {
  if (!content.startsWith('---\n')) {
    return null
  }

  const lines = content.split('\n')
  const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---')
  if (closingIndex < 0) {
    return null
  }

  const frontMatterLines = lines.slice(1, closingIndex)
  const parsed = {}
  let currentListKey = null

  for (const line of frontMatterLines) {
    if (line.trim() === '') {
      continue
    }

    const listItemMatch = line.match(/^\s*-\s+(.*)$/)
    if (listItemMatch) {
      if (!currentListKey) {
        throw new Error(`Invalid front matter list item without key: ${line}`)
      }
      parsed[currentListKey].push(listItemMatch[1])
      continue
    }

    currentListKey = null

    const keyOnlyMatch = line.match(/^([a-z_]+):\s*$/)
    if (keyOnlyMatch) {
      currentListKey = keyOnlyMatch[1]
      parsed[currentListKey] = []
      continue
    }

    const scalarMatch = line.match(/^([a-z_]+):\s*(.*)$/)
    if (!scalarMatch) {
      throw new Error(`Unsupported front matter line: ${line}`)
    }

    const [, key, rawValue] = scalarMatch
    parsed[key] = rawValue === '[]' ? [] : rawValue
  }

  return parsed
}

function validateEntry(frontMatter, registryEntry, relativePath, errors) {
  const expected = {
    doc_id: registryEntry.id,
    title: registryEntry.title,
    category: registryEntry.category,
    status: registryEntry.status,
    read_priority: registryEntry.readPriority,
    topics: registryEntry.topics,
    canonical_for: registryEntry.canonicalFor,
    depends_on: registryEntry.dependsOn,
    supersedes: registryEntry.supersedes,
    superseded_by: registryEntry.supersededBy,
  }

  for (const field of FRONT_MATTER_FIELDS) {
    if (!(field in frontMatter)) {
      errors.push(`Missing front matter field '${field}' in ${relativePath}`)
      continue
    }

    const actual = frontMatter[field]
    const target = expected[field]

    if (Array.isArray(target)) {
      if (!Array.isArray(actual) || actual.length !== target.length || actual.some((item, index) => item !== target[index])) {
        errors.push(
          `Front matter field '${field}' mismatch in ${relativePath}: expected ${JSON.stringify(target)}, got ${JSON.stringify(actual)}`,
        )
      }
      continue
    }

    if (String(actual) !== String(target)) {
      errors.push(
        `Front matter field '${field}' mismatch in ${relativePath}: expected ${JSON.stringify(target)}, got ${JSON.stringify(actual)}`,
      )
    }
  }
}

await main()
