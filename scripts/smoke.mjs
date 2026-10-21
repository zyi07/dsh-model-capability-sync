/**
 * Offline-ish smoke test: download the real models.dev catalog and run the
 * matcher + mapper over the model ids this machine has configured.
 *
 * Run with `node --experimental-strip-types scripts/smoke.mjs` (Node 24 strips
 * types by default). It reads ids from the desktop profile patch when present
 * and falls back to a built-in sample, so it also works on a fresh checkout.
 */
import { readFileSync, existsSync } from 'node:fs'
import { loadCatalog } from '../src/catalog.ts'
import { matchModel } from '../src/match.ts'
import { capabilitiesOf } from '../src/mapping.ts'

const PATCH = 'C:/Users/19603/.dsh/profiles/desktop/cordis.patch.yml'

/** Pull `- id:` lines out of the llm-newapi catalog block, without a YAML dependency. */
function idsFromPatch(path) {
  if (!existsSync(path)) return undefined
  const text = readFileSync(path, 'utf8')
  const start = text.indexOf('- id: llm-newapi')
  if (start === -1) return undefined
  const block = text.slice(start)
  const ids = [...block.matchAll(/^\s+- id: (\S+)$/gm)].map(match => match[1])
  return ids.length > 0 ? ids : undefined
}

const ids = idsFromPatch(PATCH) ?? [
  'work-gj/deepseek-v4.1-flash',
  'gemini/gemini-3.8-flash-high',
  'qoder-gj/Qwen3.8-Flash',
  'beichenapi/gpt-6',
  'openai/gpt-4o',
]

const catalog = await loadCatalog({ refresh: true })
console.log(`catalog: ${catalog.modelCount} models, fetched ${new Date(catalog.fetchedAt).toISOString()}`)

const stats = { total: 0, matched: 0, image: 0, unmatched: [] }
const sample = []
for (const id of ids) {
  stats.total += 1
  const match = matchModel(catalog, id)
  if (match === undefined) {
    stats.unmatched.push(id)
    continue
  }
  stats.matched += 1
  const entry = catalog.byId.get(match.modelId)?.find(candidate => candidate.provider === match.provider)
  const fields = entry === undefined ? {} : capabilitiesOf(entry)
  if (fields.input?.includes('image')) stats.image += 1
  if (sample.length < 6) sample.push({ id, via: match.via, to: `${match.provider}/${match.modelId}`, fields })
}

console.log(`matched ${stats.matched}/${stats.total}, image-capable ${stats.image}, unmatched ${stats.unmatched.length}`)
console.log('sample:', JSON.stringify(sample, null, 1))
if (stats.unmatched.length > 0) console.log('unmatched ids:', stats.unmatched.join(', '))
