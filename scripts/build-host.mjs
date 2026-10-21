/**
 * Host-half build: bundle `src/index.ts` (and its relative modules) into one
 * ESM file. Every bare specifier stays external, so the plugin resolves
 * `@deepseek-ai/*` from the host installation at load time — the same contract
 * the official adapters use.
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: 'lib/index.js',
  sourcemap: true,
  legalComments: 'none',
  packages: 'external',
  logLevel: 'info',
})

console.log('dsh-model-capability-sync: wrote lib/index.js')
