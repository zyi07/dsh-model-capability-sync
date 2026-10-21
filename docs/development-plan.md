# 开发计划

## P0 骨架（完成）

**目标**：能构建、能装、能在设置页出现一行。

- [x] `package.json`（`dsh.bundle.patch` + `dsh.client`）
- [x] `cordis.patch.yml`（插入 `model-capability-sync` 行）
- [x] `tsconfig.json` / `tsconfig.client.json`
- [x] `scripts/build-host.mjs` / `scripts/build-client.mjs`

**验收**：`npm run build` 产出 `lib/index.js`（单文件 ESM，零 import）与
`lib/client.js`（`window.__ModuleLoader__.load` 包装）；两端 `tsc --noEmit` 通过。

## P1 目录与匹配（完成）

**目标**：只读地把"目录怎么说"算出来。

- [x] models.dev 下载 + 6h 缓存 + 双索引（精确 / 折叠）
- [x] 五级匹配 + 第一方厂商优先
- [x] 字段映射（context / output / input / reasoningEfforts / name）
- [x] RPC `preview` 端点

**验收**：`node --experimental-strip-types scripts/smoke.mjs` 在真实目录上
匹配 65/74（88%），44 个声明支持图片。

## P2 设置页与写入（完成，待真实 GUI 验证）

**目标**：看得到、点得动、写得进。

- [x] 设置页：目标插件 / 供应商 / 模型数 / 分析 / 刷新 / 覆盖开关
- [x] 预览表：勾选、匹配来源、四项能力
- [x] 写入：`settings.mutate` 的 `set ['providers', key, 'models']`
- [x] 默认只填空白，覆盖需显式勾选

**验收**：装进 desktop profile 重启后，设置页出现「模型能力同步」；对 `llm-pi-ai`
的 `newapi` 执行分析→应用，`cordis.patch.yml` 中对应模型出现 `input`/`contextWindow`/
`maxTokens`，且不重启即生效。

## P3 兜底（下一步）

**目标**：未匹配的 9 个 id 也有出路。

- [ ] 别名表：设置页内编辑 `网关 id → 目录 id`，随请求发给宿主
- [ ] 单模型手动编辑能力字段
- [ ] 别名持久化（写入本插件自己的 profile 条目配置）

**验收**：`work-cn/kimi-k3-1` 通过别名指向 `kimi-k3` 后能拿到能力；别名在重启后仍在。

## P4 迁移与停用旧适配器

**目标**：一份清单、一个适配器。

- [ ] 把 `dsh-llm-newapi` 的 74 个模型（含 name/context/maxTokens/reasoningEfforts）
      迁进 `llm-pi-ai` 的 `providers.newapi.models`
- [ ] 停用 `dsh-llm-newapi`（从 bundles 移除或 `disabled: true`）
- [ ] 清理 `llm-pi-ai` 与旧插件的路由冲突

**验收**：模型选择器只剩 `llm-pi-ai` 的清单；发一张图成功；启动日志无
`DUPLICATE_ADAPTER`。

**注意**：需要停应用改 profile 再重启，会中断当前会话，必须先确认。

## P5 打包（收尾）

- [ ] `npm pack` 产物装进隔离 `DSH_HOME` 验证
- [ ] 版本号 `0.1.0`（本插件独立版本线，不跟随宿主）
- [ ] README 能力表与已知边界复核
