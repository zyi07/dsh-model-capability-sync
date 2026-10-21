# 技术选型

## 结论

| 项 | 选择 | 理由 |
| --- | --- | --- |
| 语言 | TypeScript 5.9 | 与 dsh 官方插件一致；纯类型标注，构建时擦除 |
| 宿主构建 | esbuild → 单文件 ESM | 官方适配器同款产物形态；`packages: 'external'` 让 `@deepseek-ai/*` 从宿主解析 |
| 浏览器构建 | esbuild → `window.__ModuleLoader__.load` 模块工厂 | dsh web 的客户端加载契约，`scripts/build-client.mjs` 与官方插件一致 |
| 运行时依赖 | **零** | 宿主产物不 import 任何第三方包；网络只用全局 `fetch`，文件只用 `node:fs/promises` |
| 代理 | 可选动态导入 `undici` 的 `ProxyAgent` | 只在配置了代理时才加载；缺失时报明确错误而不是静默直连 |
| 目录缓存 | 内存 6h + 本机 `~/.dsh/model-capability-sync/catalog.json` | 宿主进程的网络和命令行不一定相同；下载失败时回落本机副本，页面不至于打不开 |
| 目录源 | `https://models.dev/api.json` | 公开、无需鉴权、9165 个模型 100% 带 `modalities` |
| 配置读写 | 官方 settings 服务（`remote.settings.describe/mutate`） | 与官方 Models 页同一条路径，落点就是 profile patch，热生效 |
| 状态管理 | React 局部 state | 页面只有一张表，不引入状态库 |

## 为什么不用别的

- **不做完整适配器**：SSE 解析、重试、工具调用、多模态序列化都要长期跟上游，
  官方 pi-ai 已经在维护；我们只补数据，维护面小一个数量级。
- **不在浏览器直连 models.dev**：跨域 + 代理不可控；宿主拉取后经自有 RPC 返回。
- **不直接改 YAML 文件**：会和 Loader 的写回机制打架；settings 服务是官方写入点。
- **不引入 YAML 解析**：宿主半不读配置；冒烟脚本用正则从 patch 里取 id 即可。

## 兼容性

- 目标宿主线：dsh `0.2.x`（验证于 `0.2.1-rc.2`）。
- 浏览器半依赖 `slots` / `locale` / `connection` / `remote.settings` 四个服务。
- `remote.settings` 的两个方法都返回**信封**：`{ok:true, value}` / `{ok:false, error:{code,message}}`。
  - `describe()` → `value = { writable, namespaces: [{ ns, revision, base, user, value }] }`
  - `mutate(ns, ops, expectedRevision)` → `value =` 该命名空间的视图（同上单条）
  - 拒绝码里 `settings/conflict` 表示 `expectedRevision` 过期，需重新 `describe` 再写。
  - 实证位置：`@deepseek-ai/dsh-client-ui-settings` 的 `SettingsDescribeMirror.run()` 与
    `ConfigFormController.mutate()/derive()`。
- 宿主半依赖 `connection` + `webServer` 两个服务（无 Web 服务的 profile 中本插件不挂载）。

## 目录结构决定

宿主与浏览器两个入口分开构建，共享 `src/types.ts` 的纯类型；`src/match.ts` 与
`src/mapping.ts` 是纯函数，可被 Node 直接跑（`scripts/smoke.mjs` 就是这么做的）。
