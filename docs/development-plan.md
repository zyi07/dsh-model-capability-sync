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

## P2 设置页与写入（完成）

**目标**：看得到、点得动、写得进。

- [x] 设置页：写入位置 / 供应商 / 模型数 / 分析 / 刷新 / 覆盖开关
- [x] 预览表：勾选、匹配来源、四项能力
- [x] 写入：`settings.mutate` 的 `set ['providers', key, 'models']`
- [x] 默认只填空白，覆盖需显式勾选

**验收**：装进 desktop profile 重启后，设置页出现「模型能力同步」；对 `llm-pi-ai`
的 `newapi` 执行分析→应用，`cordis.patch.yml` 中对应模型出现 `input`/`contextWindow`/
`maxTokens`，且不重启即生效。

## P2.5 体验完善（完成）

**目标**：把"能写"变成"看得清、改得准"。

- [x] 差异预览：每个单元格显示 `旧值 → 新值`，顶部汇总"将修改 N 行 · M 个字段"
- [x] 搜索框（模型 ID / 目录 ID）+「只看有变化的」
- [x] 未变化的行不可勾选；「全选」只作用于可见且有变化的行
- [x] 写入后自动刷新「当前生效」列
- [x] 粘性表头 + 表格滚动容器
- [x] 未匹配行显示原因（`reason`）
- [x] 自动排序：有前缀按前缀分组，组内按名称；无前缀直接按名称（`src/sort.ts`）
- [x] 不写 `name`：只填能力事实，任何模式下都不重命名模型
- [x] 写入位置不暴露插件 id：显示「原生配置 · pi-ai 适配器」，来源来自内置映射表；
      只有一个可写目标时显示为静态一行，不再给一个只有单项的下拉
- [x] 修复：切换写入位置时残留上一个目标的模型列表
- [x] 修复：`settings/conflict` 不再只报错，改为重读最新值并提示重试

**验收**：表格能看出每个字段从什么变成什么；输入 `kimi` 只剩相关行；点「应用」
成功后「当前生效」列自动更新；重复点两次「应用」不出现 `settings/conflict`。

## P3 兜底（下一步）

**目标**：未匹配的 9 个 id 也有出路。

**已确认的前提**：这 9 个 id 在 models.dev 里确实不存在，或只有"名字像但不是"的
条目（`gpt-6` → 只有 `gpt-6-sol/luna/astra`；`kimi-k2.7` → 只有 `kimi-k2.7-code`；
`kimi-k2.8-preview` → 只有老一代 `kimi-k2`）。**因此不放宽匹配规则**，只做人工指定。

- [ ] 别名表：设置页内编辑 `网关 id → 目录 id`，随请求发给宿主
- [ ] 单模型手动编辑能力字段
- [ ] 别名持久化（`~/.dsh/model-capability-sync/aliases.json`，不动 profile）

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

## P5 打包（仓库已就绪，待发布）

**目标**：别人能用一条命令装上。

- [x] `LICENSE`（MIT）
- [x] `package.json`：`engines.dsh`、`publishConfig.access`、`peerDependenciesMeta`、
      `prepublishOnly`、`verify:package`；删掉指向不存在文件的 `types`
- [x] `scripts/verify-package.mjs`：25 项发布前自检（清单见 `npm run verify:package`）
- [x] `npm pack` 产物在干净目录 `npm install` 后验证：可 `import`、`name`/`inject`/`apply`
      正确、patch 与 client 产物齐全（12 项全过）
- [x] README：npm 安装 + 桌面版安装路径 + 许可证
- [x] `docs/publishing.md`：发版手册、社区目录条目文案、自建索引 JSON
- [x] `repository` / `homepage` / `bugs` 三个字段
- [x] 执行 `npm publish`（2026-10-21，`dsh-model-capability-sync@0.1.0`；
      从 registry 重新安装后 12 项检查全过）
- [ ] 向 awesome-dsh-plugin 提 PR 收录（条目形状已确认，见 `docs/publishing.md` 5.1）

**验收**：`npm view dsh-model-capability-sync version` 有输出；在干净 profile 里
`dsh plugin add dsh-model-capability-sync` 能装上并出现在设置页。
