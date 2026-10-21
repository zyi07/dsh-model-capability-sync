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
