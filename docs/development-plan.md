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
- [x] 字段映射（context / output / input / reasoningEfforts）
- [x] RPC `preview` 端点

**验收**：`node --experimental-strip-types scripts/smoke.mjs` 在真实目录上能匹配
绝大多数已配置模型。

## P2 设置页与写入（完成）

**目标**：看得到、点得动、写得进。

- [x] 设置页：写入位置 / 供应商 / 模型数 / 分析 / 刷新 / 覆盖开关
- [x] 预览表：勾选、匹配来源、四项能力
- [x] 写入：`settings.mutate` 的 `set ['providers', key, 'models']`
- [x] 默认只填空白，覆盖需显式勾选

**验收**：装进 profile 重启后，设置页出现「模型能力同步」；对 `llm-pi-ai`
的供应商执行分析→应用，`cordis.patch.yml` 中对应模型出现 `input`/`contextWindow`/
`maxTokens`，且不重启即生效。

## P2.5 体验完善（完成）

**目标**：把"能写"变成"看得清、改得准"。

- [x] 差异预览：每个单元格显示 `旧值 → 新值`，顶部汇总"将修改 N 行 · M 个字段"
- [x] 搜索框（模型 ID / 目录 ID）+「只看有变化的」
- [x] 未变化的行不可勾选；「全选」只作用于可见且有变化的行
- [x] 写入后自动刷新「当前生效」列
- [x] 粘性表头 + 表格滚动容器
- [x] 未匹配行显示原因（`reason`）
- [x] 写入位置不暴露插件 id：显示「原生配置 · pi-ai 适配器」，来源来自内置映射表；
      只有一个可写目标时显示为静态一行，不再给一个只有单项的下拉
- [x] 修复：切换写入位置时残留上一个目标的模型列表
- [x] 修复：`settings/conflict` 不再只报错，改为重读最新值并提示重试

**验收**：表格能看出每个字段从什么变成什么；输入 `kimi` 只剩相关行；点「应用」
成功后「当前生效」列自动更新；重复点两次「应用」不出现 `settings/conflict`。

## P2.6 名称重定向（完成）

**目标**：同名不同来源的模型在列表里能分开。

> 注：本阶段推翻了 P2.5 里"不写 `name`"的决定。用户明确要求重命名，
> 于是重命名成为独立动作，与能力补全分离，互不影响。

- [x] `src/client/rename.ts`：`redirectName` / `planNames` / `renameModels` 纯函数
- [x] 规则：取 ID 第一个 `/` 前的前缀，**放在名称最前面**，全角 `【】` 包裹
- [x] 无前缀的 ID 归 `【other】`，不再跳过
- [x] 幂等：先剥（开头 `【x】`、开头 `x/`、旧的末尾 `【x】`、半角 ` (x)`）再贴
- [x] 表格新增「名称」列，显示重定向后的结果
- [x] 「重定向」按钮一键应用到全部模型（不逐行勾选）

**验收**：`qoder/qfmodel` 与 `qoder-cn/qfmodel` 显示为
`【qoder】 Qwen3.8-Flash` / `【qoder-cn】 Qwen3.8-Flash`；连点两次不叠加；
`standalone` 显示为 `【other】 standalone`；模型 ID 不变。

## P2.7 排序与重排（完成）

**目标**：列表顺序可切换、可随时重排一次。

- [x] `src/sort.ts`：`SortMode`（`prefix` / `redirected`）、`sortByModelId(…, mode)`
- [x] 两种排序都是供应商优先，组内按名称；大小写折叠，原始 ID 兜底
- [x] 设置页「排序」下拉二选一
- [x] 「重排」按钮：按当前排序写回模型数组，无需开关
- [x] 补全 / 重定向 / 重排三个动作都按当前排序落盘

**验收**：切换排序下拉后列表立即重排；点「重排」写回配置；
同一份配置重复重排结果完全一致。

## P2.8 匹配规则扩展（完成）

**目标**：把"只是加了后缀"的模型救回来。

**背景**：未匹配列表里 37 个 id 中，绝大多数与目录只差一层包装（销售点后缀、
路由标签、尾部截断、构建号、多级命名空间、版本写法）。

- [x] 后缀表从 10 个词扩到 27 个（含 `-tiered`/`-trial`/`-disabled`/`-official`/
      `-free`/`-it`/`-reasoning` 等）
- [x] 路由标签剥离（`:free` 等）
- [x] 构建号剥离（`kimi-k3-1` → `kimi-k3`）
- [x] 版本点折叠（`4.5` → `4-5`）
- [x] 前缀索引（惰性构建，按前缀找更长 id）
- [x] 逐段剥供应商前缀（不只剥 basename）
- [x] `MatchVia` 新增 `prefix`，界面显示「前缀匹配」
- [x] 经销商标签剥离（`sn-glm-5-3` → `glm-5-3`），需剥后精确命中；版本分隔符双向折叠
- [x] `scripts/test-match.mjs` 扩到 25 条

**验收**：那 37 个 id 中 34 个能匹配（剩 3 个是 id 里根本没有模型名、
或目录里确实没有的）。

## P3 兜底（下一步）

**目标**：剩下无法自动推断的 id 也有出路。

**已确认的前提**：自动规则已尽力（见 P2.8）。剩余未匹配分两类：

1. 纯代号且没有显示名称（如 `1fmodel`）
2. 目录里确实没有该模型（如 `qoder-gj/d4`、`qoder-gj/glm3.5fmodel`）

**因此只做人工指定，不再放宽自动规则**（放宽会带来误判）。

- [ ] 别名表：设置页内编辑 `网关 id → 目录 id`，随请求发给宿主
- [ ] 单模型手动编辑能力字段
- [ ] 别名持久化（`~/.dsh/model-capability-sync/aliases.json`，不动 profile）

**验收**：`1fmodel` 通过别名指向某个目录 id 后能拿到能力；别名在重启后仍在。

## P4 迁移与停用旧适配器

**目标**：一份清单、一个适配器。

- [ ] 把 `dsh-llm-newapi` 的模型清单（含 name/context/maxTokens/reasoningEfforts）
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
      `prepublishOnly`、`verify:package`
- [x] `scripts/verify-package.mjs`：25 项发布前自检
- [x] `npm pack` 产物在干净目录 `npm install` 后验证：可 `import`、
      `name`/`inject`/`apply` 正确、`lib/` 与 `src/` 齐全
- [x] README：npm 安装 + tarball 安装 + 桌面版安装路径 + 许可证
- [x] `docs/publishing.md`：发版手册、社区目录条目文案、自建索引 JSON
- [x] `repository` / `homepage` / `bugs` 三个字段
- [x] 本地打 tarball 供离线安装（`dsh-model-capability-sync-0.1.0.tgz`）
- [ ] 向 npm 发布 0.2.0（含名称重定向、排序、匹配规则扩展）
- [ ] 向 awesome-dsh-plugin 提 PR 收录（条目形状已确认，见 `docs/publishing.md` 5.1）

**验收**：`npm view dsh-model-capability-sync version` 有输出；在干净 profile 里
`dsh plugin add dsh-model-capability-sync` 能装上并出现在设置页。
