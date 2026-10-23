# devlog

## 2026-10-23

### 今天完成

- 名称重定向规则补"清洗"（用户 m00427："已有前缀的清洗一下，只保留我们加的【】括号的方式"）：
  `redirectName` 先剥名称开头的 `prefix/`（网关常把 ID 原样当 label 返回，profile 里实测 53 个），
  再剥旧的半角 ` (prefix)` 与重复的 `【prefix】`，最后统一追加一个全角 `【prefix】`——前缀只出现在末尾一处。
  locale/README/requirements 文案同步为"清洗"语义；单测扩到 11 条（开头前缀迁移、清洗后幂等）。
  typecheck/build 通过，新 bundle 已部署（dist 里 `\u3010` 为 esbuild 对全角括号的正常转义）。

- 按用户反馈把名称重定向的后缀改成全角 `【prefix】`（只保留末尾括号这一种形式）：
  `Qwen3.8-Flash` → `Qwen3.8-Flash【qoder】`。半角 ` (prefix)` 视为旧拼写，重跑规则
  会被剥掉并换成全角形式（自动迁移，不会叠加）。单测扩到 8 条，README / requirements /
  文案同步更新。提交 `2b44141`。

- 新增第二个设置节「名称重定向」（`model-name-redirect`）：把网关模型 ID 的来源前缀
  追加到显示名称末尾，解决 `qoder/qfmodel` 与 `qoder-cn/qfmodel` 同为
  `Qwen3.8-Flash` 无法区分的问题。
  - `src/client/rename.ts`：纯规则 —— `sourcePrefixOf` 取第一个 `/` 前的前缀；
    `redirectName` 先剥掉同名 ` (prefix)` 后缀再追加，重复应用幂等；无前缀 ID 不动；
    名称为空时用 ID 去前缀后的部分兜底。
  - `src/client/RenameSection.tsx`：选写入位置 / 供应商 → 逐行展示「来源前缀 /
    当前名称 / 新名称」→ 搜索、只看有变化的、勾选 → 写入 `name` 字段；同样处理
    `settings/conflict`（重载后请用户再点一次）。
  - `src/client/shared.ts`：把配置读取类型与 `providersOf/modelsOf/sortedModelsOf/
    textOf/isBlank/targetLabelOf/TARGET_DEFAULT` 从 `SyncSection.tsx` 抽出来，两个
    设置节共用；`apply.ts` 拆出 `settingsInjected` 并注册第二个 section（order 17）。
  - 文案：zh/en 同步新增 `navRedirect`、`redirect*`、`colPrefix`、`colNameBefore`、
    `colNameAfter` 等键。
  - 测试：`scripts/test-rename.mjs`（`npm run test:rename`），7 条断言覆盖前缀解析、
    幂等、兜底、不改输入数组。
- 更新 README（「名称重定向」小节、目录结构、测试命令）与 `docs/requirements.md`
  （F10 + 明确不做里补一条"不重写用户自起的名称"）。

### 待做什么

- 在浏览器里实际点一次「写入名称」，确认模型选择器显示为 `Qwen3.8-Flash (qoder)`。
- 若未来需要在选择器里按来源分组，可考虑把 `sourcePrefixOf` 暴露给排序层。

## 2026-10-21

### 今天完成

- 立项：把「维护一个完整 LLM 适配器」改为「只做能力补全的旁路插件」。
  调用交给官方 `@deepseek-ai/dsh-llm-pi-ai`，本插件只负责查目录、算字段、写配置。
- P0 骨架：
  - `package.json`（`dsh.bundle.patch` + `dsh.client` 双端声明，零运行时依赖）
  - `cordis.patch.yml`（插入插件行 `model-capability-sync`，不注册 LLM 路由）
  - `tsconfig.json`（宿主）/ `tsconfig.client.json`（浏览器）
  - `scripts/build-host.mjs`（esbuild → 单文件 ESM）、`scripts/build-client.mjs`
    （esbuild → `window.__ModuleLoader__.load` 模块工厂）
- P1 宿主核心：
  - `catalog.ts`：models.dev 下载 + 6 小时内存缓存 + 精确/折叠双索引；代理走可选
    `undici` 动态导入
  - `match.ts`：别名 → 精确 → 折叠 → 去前缀 → 去变体后缀；第一方厂商优先
  - `mapping.ts`：`modalities.input → input`、`limit.context → contextWindow`、
    `limit.output → maxTokens`、`reasoning_options[effort] → reasoningEfforts`
  - `index.ts`：RPC 通道 `/model-capability-sync` 的 `preview` 端点
- P2 浏览器半：设置页（目标插件 / 供应商 / 模型表 / 勾选 / 覆盖开关 / 应用），
  写入走 `remote.settings.mutate` 的 `set ['providers', key, 'models']`。

### 实测数据

- 目录规模：232 个供应商 / 9164 个模型，100% 带 `modalities`，6842 个带推理档位
- 本机 74 个已配置模型：**匹配 65 个（88%）**，其中 **44 个声明支持图片**
- 未匹配 9 个：`beichenapi/codex-auto-review`、`beichenapi/gpt-6`、
  `qoder-cn|qoder-gj|work-gj|work-cn` 的 `Kimi-K2.8-Preview`、
  `sensenova/sensenova-u1.5-lite`、`work-cn/kimi-k2.7`、`work-cn/kimi-k3-1`

### 明天计划

- P3：别名表（覆盖那 9 个未匹配 id）+ 单模型手动编辑
- P4：把旧适配器 `dsh-llm-newapi` 的模型清单迁进 `llm-pi-ai` 并停用旧插件
  （需要先停应用、改 profile、重启，等用户确认）

### 风险 / 问题

- 写入依赖 `remote.settings.mutate` 跨命名空间可用；当前 0.2.1-rc.2 实测无 owner 校验，
  上游若收紧需改走「直接编辑 YAML + 提示重启」。

### 装进 desktop profile 后的首个缺陷（已修）

- 现象：设置页显示 `加载失败: list.filter is not a function`。
- 原因：`remote.settings.describe()` 返回的是**信封** `{ok:true, value:{writable, namespaces:[…]}}`，
  不是命名空间数组；`SyncSection.load()` 直接把它当数组 `.filter`。
  依据：官方 `@deepseek-ai/dsh-client-ui-settings` 的 `SettingsDescribeMirror.run()`
  里写着 `const response = await this.ctx.remote.settings.describe(); response.ok ? {view: response.value} …`。
- 修复（`src/client/apply.ts`）：
  - 新增 `refusalOf` / `unwrap` / `namespacesOf`，把信封统一拆开，数组和信封两种形状都接受；
  - `describeSettings` 返回 `value.namespaces`；
  - `mutateSettings` 拆信封并在 `ok:false` 时抛 `error.message`，把拒绝原因显示到页面上；
  - 返回 `settings.mutate` 的命名空间视图，页面用它刷新持有的 `revision`，
    避免连续两次「应用」时第二次报 `settings/conflict`。
- 顺带：新增 `loading` 文案，首屏不再复用「正在匹配…」。
- 命名空间视图字段（官方 `ConfigFormController.derive()` 实证）：`ns / revision / base / user / value`。

### 待验证

- 页面需刷新一次（只改了浏览器半，宿主半未变，不必重启应用）。

### 第二个缺陷：`input: []` 被当成「已填过」（已修）

- 现象：点「应用」后 `contextWindow` / `maxTokens` / `reasoningEfforts` 都写进去了，
  但 74 个模型里 73 个的 `input` 还是 `[]`，只有默认模型 `work-gj/deepseek-v4.1-flash`
  拿到了 `[text, image]`。
- 原因：配置 schema 会给没声明的字段补默认值，`input` 的默认值是 `[]`。
  我原来的「只填空白字段」只把 `undefined` 当空白，于是 `[]` 被当成「你已经填过了」，
  直接跳过。唯一被写进去的那个模型，恰好是 describe 里连 `input` 键都没有的。
- 修复：`mergeModel` 的空白判定改为 `isBlank()` —— `undefined` / `''` / `[]` / `{}` 都算空白；
  `false` 和 `0` 是明确决定，不算空白。
- 影响面：只会多填「本来就是空」的字段，你手填过的非空值仍然不会被改。

### 新增「当前生效」诊断列（`live` 端点）

- 动机：配置文件写对了，聊天仍然可能报「不支持图片」——因为 `newapi` 这个 provider
  路由可能被另一个插件抢先注册（`dsh-llm-newapi` 与 `llm-pi-ai` 都声明 `newapi`，
  `dsh-llm` 对同一路由第二次注册会抛 `DUPLICATE_ADAPTER`，只有先注册的那个生效）。
  配置属于 pi-ai、路由却由 llm-newapi 服务时，写进去的 `input` 完全不参与请求。
- 实现：宿主新增 `live` 端点，用 `ctx.llm.resolveModelInfo(provider, model)` 读
  **真正接管该路由的适配器**此刻上报的 `inputModalities` / `contextWindow` / `defaultMaxTokens`；
  页面在「分析」时顺带取一次，新增「当前生效」列和一行汇总。
- 判读：两列一致 = 写进去就生效；不一致 = 路由被别的插件占着，必须停用那个插件。

### 第三步：`fetch failed`（已修）

- 现象：重启后点「分析能力」，页面报 `fetch failed`。
- 原因：目录下载只有一次机会，models.dev 一次失败就整页不可用；宿主进程
  （Electron 主进程）和命令行走的网络路径不一定相同，命令行能通不代表应用能通。
- 修复：
  - 下载失败重试 3 次（间隔 600ms）；
  - 仍失败则回落到本机缓存 `~/.dsh/model-capability-sync/catalog.json`，
    响应带 `stale: true`，页面显示「正在使用本机缓存（时间）」；
  - 只有「下载失败 + 本机无缓存」才报错，错误里带网络原因；
  - 新增 `scripts/warm-cache.mjs` 预热缓存（已在本机执行：9165 个模型 / 5.9 MB）。
- 附带：`tsconfig.json` 的 `types` 从 `[]` 改为 `["node"]`，新增 devDependency
  `@types/node` —— 宿主半现在要用 `node:fs/promises`、`node:os`、`node:path`。
  运行时依赖仍然是零。
- 已知限制：`undici` 代理路径在 Electron 宿主里通常不可用（没有该 npm 包），
  「宿主网络必须能直连 models.dev」这条约束目前靠本机缓存绕过，不靠代理。

### 批次一：体验完善（完成）

- **差异预览**：每个单元格渲染 `旧值 → 新值`（旧值加删除线、置灰），顶部汇总
  「将修改 N 行 · M 个字段」。未变化的行不可勾选，「全选」只作用于可见且有变化的行，
  所以不会出现"全选了一堆本来就没变化的东西"。
- **筛选**：搜索框（模型 ID / 目录 ID 双向匹配）+「只看有变化的」。
- **写入后自动刷新「当前生效」列**，不用再点一次「分析能力」。
- **粘性表头 + 滚动容器**（`max-height: 460px`），74 行滚动时列名不再跑掉。
- **未匹配行显示 `reason`**（后端一直在返回，之前没展示）。
- **自动排序**（新文件 `src/sort.ts`）：排序键 = `[前缀小写, 名称小写]`，末尾用原始 id
  兜底保证稳定。有前缀的按前缀分组，组内按名称；无前缀的整串当组名，直接按名称。
  写配置时也按这个顺序落盘，所以模型选择器的顺序也会变整齐。
- **不写 `name`**：本插件只填能力事实，不重命名模型。`CapabilityFields` 里已经没有
  `name`，`capabilitiesOf()` 也不再返回它 —— 任何模式下（包括勾选「覆盖已有值」）
  都不会改模型名称。
  - 教训：批次一最初加了「`name === id` 视为占位符、用目录名覆盖」这条规则，用户
    明确反对（"让你排序没让你改模型名称"）。需求只说了排序，改名是我自己扩的范围。
    已回退，并且顺手把整条改名路径都封掉，避免「覆盖已有值」时又出现同样的问题。
- **写入位置不再暴露插件 id**（用户反馈：「目标插件是 dsh 原生的配置时，不应该显示插件名称」）：
  - 控件从「目标插件」改名为「写入位置」；
  - 选项文案改成「来源 · 名称」：`原生配置 · pi-ai 适配器` / `原生配置 · DeepSeek 官方` /
    `插件配置 · NewAPI`；表里没有的命名空间显示 `插件配置 · <ns>`，原始 id 只放 `title`；
  - 来源判定用内置表 `TARGET_DIRECTORY`，**不靠 id 前缀猜**——客户端看不到命名空间属于
    哪个 npm 包（`settings.describe()` 只给 `ns/revision/value/base/user`），
    按 `llm-` 前缀推断迟早会把第三方插件误标成官方；
  - 只有一个可写目标时**不渲染下拉**，改成一行静态文案（之前是个只有一项的下拉，
    看起来能选其实没得选）。
- 修 bug：切换「写入位置」时 `providerKey`/`models`/`liveRows` 不重置，会残留上一个
  目标的列表。现在统一走 `showProvider(ns, key)`。
- 修 bug：`settings/conflict` 原来只把错误文本丢到页面上。现在 `refusalOf` 保留
  `error.code`，页面识别到冲突后**重读最新配置**并提示"确认后再点一次应用"——
  故意不自动重试，因为盲目重试会覆盖别人刚保存的内容。

### 实测

- 排序脚本对真实配置跑过：152 个 id（pi-ai 74 + llm-newapi 74 + 其他），
  结果按 `beichenapi → deepseek-* → gemini/… → qoder-cn → qoder-gj → sensenova →
  work-cn → work-gj` 分组，组内名称有序。
- 两端 `tsc --noEmit` 通过，`npm run build` 通过（`lib/client.js` 36.5 KB）。

### P5 发版准备（仓库就绪，未发布）

先查了 DSH 的分发机制，结论写进 `docs/publishing.md`：

- `dsh plugin add` 接受四类 spec（`@deepseek-ai/dsh-plugin-manager` 的 `parseInstallSpec`）：
  npm 包名（可带 `@range`）、git URL/简写、tarball（本地绝对路径或 http(s)）、`link:`。
- 官方发现页 `@deepseek-ai/dsh-plugin-market` 的 `indexes` **默认是空数组**——
  不发索引源就没有任何市场请求，所以只发 npm 别人搜不到。
- 社区目录走 `awesome-dsh-plugin` 仓库的 PR，`dshmarket` 与站点自动收录。
- 市场索引是"格式 1" JSON（`@deepseek-ai/dsh-plugin-market-index` 校验）：
  `format: 1`、`title` 必须有 `en` 键、`publishTimestamp` 是 Unix 秒、
  `source.type` 为 `npm` 或 `git`（git 要 40 位 commit）。
- 兼容性由 `package.json` 的 `engines.dsh` 单独决定（`evaluatePluginCompatibility`），
  声明了就忽略 `peerDependencies` 里的 `@deepseek-ai/dsh*`。

本批改动：

- 新增 `LICENSE`（MIT）。
- `package.json`：加 `engines.dsh: ^0.2.1-rc.2`（实测运行时版本）、`publishConfig.access: public`、
  `peerDependenciesMeta` 把 `@deepseek-ai/cordis` 和 `react` 标成 optional（否则 pnpm 会
  真把它们装进用户 profile）、`prepublishOnly`（typecheck + build + verify）；
  **删掉 `types` 字段**——它指向不存在的 `lib/types/index.d.ts`，留着会让
  TS 消费者报错；`keywords` 补 `dsh-plugin`。
- 新增 `scripts/verify-package.mjs`（22 项自检）并接进 `prepublishOnly`。
- README：npm 安装、桌面版必须走「设置 → 插件」、`engines.dsh` 说明、许可证、里程碑更新。
- 新增 `docs/publishing.md`：发版手册 + 社区目录中英条目文案 + 自建索引 JSON 示例。

实测：

- `npm pack` → 22 个文件 / 69.3 kB；在干净目录 `npm install` 后 12 项检查全过
  （可 `import`、`name`/`inject`/`apply` 正确、patch 与 client 产物齐全、
  client 只外部化 react、宿主产物无第三方 import）。可选 peer 没有被安装，符合预期。
- `npm run verify:package` 22 项全过。

待办：`npm publish` 与 awesome-dsh-plugin 的 PR 需要维护者本人操作。

仓库地址已定：`https://github.com/zyi07/dsh-model-capability-sync`，
`repository` / `homepage` / `bugs` 已填进 `package.json`，并加了 3 项自检
（`verify:package` 现在 25 项）。本地 git 已加 `origin` 远端。

### 下一步（等确认）

- P3：别名表 + 单模型手动编辑（解决 9 个未匹配）。
- P4：停用 `dsh-llm-newapi`（bundle + patch 条目），让 `llm-pi-ai` 独占 `newapi` 路由，
  图片能力才会真正进入请求链路。

### 发布完成（2026-10-21）

- `npm publish` 成功：`dsh-model-capability-sync@0.1.0`。
- 从 registry 重新 `npm install` 后跑了同样 12 项检查：全过（可 import、
  `name`/`inject`/`apply` 正确、patch 与 client 产物齐全、可选 peer 未被安装）。
- `npm view` 确认：`engines.dsh = ^0.2.1-rc.2`、`repository` 指向 GitHub、
  unpackedSize 236941。
- 社区目录的条目形状已从 `dsh-plugin-catalog@2026.1021.8781` 里核实
  （6254 条真实记录）：手填 `name/owner/url/category/npm/description`，
  `page/version/stars/downloads/capabilities` 由构建脚本生成；分类用 `model`。
  已写进 `docs/publishing.md` 5.1。
- 本机到 `raw.githubusercontent.com`、`cdn.jsdelivr.net`、以及后来的 `github.com`
  clone 都不稳定（推自己的仓库能成功，clone 别人的仓库超时），所以 PR 交给维护者在
  网页上提。

### 社区目录投稿方式核实（2026-10-21）

- 拉下 `awesome-dsh-plugin` 仓库读了 `contributing.md`：投稿是**一个插件一个 YAML**
  （`data/plugins/<owner>__<repo>.yml`），不是改 README；README 由脚本生成。
- 两条硬性门槛我们还没过：
  1. **仓库创建满 1 天**（CI 自动查）。本仓库建于 2026-10-21 16:52 (+08:00)，
     所以 **2026-10-22 16:52 之后**才能提。
  2. **仓库要加 `dsh-plugin` topic**（仓库 About 里设置）。
- 其余要求都满足：`dsh.bundle` + `cordis.patch.yml`、真实代码、分类 `model`、
  官方包用 `peerDependencies`、已发布 npm（预构建安装可跳过 `allowBuilds`）。
- 已把 YAML 内容与对照表写进 `docs/publishing.md` 5.1。
- 网络：github.com 直连会超时，走本机代理 `http://127.0.0.1:7890` 才通
  （`git -c http.proxy=... push`）。
