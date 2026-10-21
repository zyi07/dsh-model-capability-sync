/**
 * Release-hygiene check for the publishable surface.
 *
 * Runs against the source tree, not a tarball, so it is fast enough to keep in
 * the release checklist. It catches the mistakes that only show up after a
 * publish: a build artifact missing from the tree, a `dsh` declaration that
 * points nowhere, a client bundle without the loader wrapper, a manifest field
 * the host would reject.
 *
 *   node scripts/verify-package.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const checks = []
const check = (label, ok, detail = '') => {
  checks.push({ label, ok, detail })
}

check('name 是合法 npm 包名', /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(manifest.name), manifest.name)
check('version 是精确 SemVer', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/.test(manifest.version), manifest.version)
check('未声明 private', manifest.private !== true)
check('publishConfig.access 为 public', manifest.publishConfig?.access === 'public')
check('engines.dsh 已声明', typeof manifest.engines?.dsh === 'string', manifest.engines?.dsh)
check('main 指向存在的文件', typeof manifest.main === 'string' && existsSync(join(root, manifest.main)), manifest.main)
check('exports["./client"] 存在', existsSync(join(root, 'lib/client.js')))
check('LICENSE 文件存在', existsSync(join(root, 'LICENSE')))
check('README 存在', existsSync(join(root, 'README.md')))

const patchPath = manifest.dsh?.bundle?.patch
check('dsh.bundle.patch 已声明', typeof patchPath === 'string', patchPath)
check('dsh.bundle.patch 文件存在', typeof patchPath === 'string' && existsSync(join(root, patchPath)))
check('dsh.client.platform 为 web', manifest.dsh?.client?.platform === 'web')

if (typeof patchPath === 'string' && existsSync(join(root, patchPath))) {
  const patch = readFileSync(join(root, patchPath), 'utf8')
  check('patch 里插入了本插件', patch.includes('model-capability-sync'))
}

if (existsSync(join(root, 'lib/client.js'))) {
  const client = readFileSync(join(root, 'lib/client.js'), 'utf8')
  check('client 带 __ModuleLoader__ 包装', client.includes('__ModuleLoader__'))
  check('client 只外部化 react', !/require\("(?!react)/.test(client))
}

const hostBundle = join(root, manifest.main ?? '')
if (existsSync(hostBundle)) {
  const host = readFileSync(hostBundle, 'utf8')
  check('宿主产物不 import 第三方包', !/^import .* from "(?!node:|\.)/m.test(host))
}

for (const entry of manifest.files ?? []) {
  check(`files 条目存在：${entry}`, existsSync(join(root, entry)))
}

const failed = checks.filter(entry => !entry.ok)
for (const entry of checks) console.log(`${entry.ok ? 'OK  ' : 'FAIL'} ${entry.label}${entry.detail === '' ? '' : ` (${entry.detail})`}`)
console.log(failed.length === 0 ? `\n全部通过：${String(checks.length)} 项` : `\n失败 ${String(failed.length)} 项`)
process.exitCode = failed.length === 0 ? 0 : 1
