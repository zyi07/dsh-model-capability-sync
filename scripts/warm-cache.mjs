/**
 * Warm the on-disk catalog copy.
 *
 * The host process may sit behind a network the command line does not share,
 * so the page falls back to `~/.dsh/model-capability-sync/catalog.json`. This
 * script fills that file from a machine that can reach models.dev, which makes
 * the first page load work even when the app itself cannot download.
 *
 *   node --experimental-strip-types scripts/warm-cache.mjs
 */
import { loadCatalog } from '../src/catalog.ts'

const catalog = await loadCatalog({ refresh: true })
console.log(`cached ${String(catalog.modelCount)} models from ${new Date(catalog.fetchedAt).toISOString()}`)
console.log('file: ~/.dsh/model-capability-sync/catalog.json')
