/**
 * Browser-half build: one closure-factory module registered on the shell's
 * module loader — `window.__ModuleLoader__.load({ id, factory })`. React and
 * the JSX runtime are the only runtime externals the shell's module table
 * supplies; every `@deepseek-ai/*` import in the source is type-only and is
 * erased here.
 */
import { build } from 'esbuild'

const ID = 'dsh-model-capability-sync'

const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
]

await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  outfile: 'lib/client.js',
  sourcemap: true,
  legalComments: 'none',
  external: CLIENT_EXTERNALS,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  banner: {
    js: [
      `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      'var module = { exports: {} }; var exports = module.exports;',
    ].join('\n'),
  },
  footer: { js: 'return module.exports; } });' },
})

console.log(`${ID}: wrote lib/client.js`)
