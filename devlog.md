# devlog

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

### 下一步（等确认）

- P4：停用 `dsh-llm-newapi`（bundle + patch 条目），让 `llm-pi-ai` 独占 `newapi` 路由，
  图片能力才会真正进入请求链路。
