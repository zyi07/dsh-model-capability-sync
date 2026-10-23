# dsh-model-capability-sync

给已经配好的 DeepSeek Harness LLM 供应商**补全模型能力参数**的插件。

它只做一件事：拿你已经配置的模型 id 去 [models.dev](https://models.dev) 查事实，把
`上下文窗口 / 输出上限 / 是否支持图片 / 推理档位` 写回官方适配器的配置里。
**它不发任何推理请求，也不注册 LLM 路由**——调用仍然由官方插件负责。

## 为什么需要它

中转网关（NewAPI 之类）的 `/models` 只返回模型 id，不告诉你上下文多大、能不能吃图片。
官方适配器把没声明的能力按"纯文本"处理，于是模型明明支持图片，界面上却提示不支持。

本插件把公开目录里的能力事实补进配置，让官方适配器能正确声明能力。

## 工作方式

```
设置页（浏览器）                       宿主
┌──────────────────────┐   RPC    ┌──────────────────────────┐
│ 读 llm-pi-ai 的配置   │ ───────► │ 下载 models.dev（带缓存） │
│ 列出模型 / 勾选       │ ◄─────── │ 匹配 id → 能力字段        │
│ 预览将写入的字段      │          └──────────────────────────┘
│ 应用 → settings.mutate│
└──────────────────────┘
```

- 写入走**官方 settings 服务**（`remote.settings.mutate`），落点是 profile 的
  `cordis.patch.yml`，热生效，不用重启。
- 默认**只填空白字段**：你手填过的值不会被改写，除非勾选「覆盖已有值」。
  空白包括 `undefined`、`''`、`[]`、`{}` —— 配置 schema 会给没填的字段补默认值
  （例如没声明 `input` 会读成 `[]`），这些默认值不算「你填过」。
- 表里有两列图片：**「图片」= 目录声明将写入的值，「当前生效」= 真正接管这条路由的
  适配器此刻上报的值**（也就是聊天请求看到的）。两列不一致，说明同一个 provider
  路由被另一个插件抢占，写这份配置不会生效。
- **每个单元格显示 `旧值 → 新值`**，顶部汇总"将修改 N 行 · M 个字段"；没有变化的行
  不可勾选，「全选」只作用于可见且有变化的行。支持按模型 ID / 目录 ID 搜索，以及
  「只看有变化的」筛选。
- **自动排序**：写入时按「前缀分组 + 组内名称」排序。有前缀的（`qoder-gj/xxx`）按
  前缀字母序分组，组内按名称；没有前缀的直接按名称。比较忽略大小写，结果稳定。
- 匹配规则由严到松：精确 → 忽略大小写 → 去供应商前缀 → 去变体后缀
  （`-high/-low/-medium/-thinking/-preview`）→ **显示名称**（再试其最后一段）→ 别名。
  优先选**第一方厂商**的目录条目，避免被聚合站的错误数字带偏。
- **名称降级**：网关常把真实模型藏在 ID 后面（`qoder/qfmodel` 其实叫 `Qwen3.8-Flash`），
  这种 ID 在目录里必然查不到。所以 ID 全试过还不够时，用你配的**显示名称**再试一次；
  名称里的来源标注（`【qoder】`、`(qoder)`、`[cn]`）先剥掉，**因此重定向与否解析结果一致**。
  命中时「匹配方式」列显示「按名称 / 名称去变体」，方便你判断可信度。
- **别名放在最后**：别名是手工兜底，而被别名处理过的名称会被所有同名行继承，放在前面等于失效。
- **排序二选一**（`排序` 下拉，两节都有）：
  - `按模型前缀排序（分组）`：先按 ID 前缀分组，组内按名称，适合「谁提供什么」的视角；
  - `按重定向后【来源】名称排序`：读的是重定向后的名称（前缀在末尾 `【】` 里），
    于是整份列表是**名称的字母序**，而不是来源分组。未重定向的行按规则预演，所以两种状态排序一致。
  名称重定向节默认用后者，并可在应用时勾选「同时按当前排序重排模型目录」。
- 目录下载失败会重试 3 次，仍失败则回落到本机缓存
  `~/.dsh/model-capability-sync/catalog.json`，页面标注「正在使用本机缓存」。
  手动预热：`node --experimental-strip-types scripts/warm-cache.mjs`。
  宿主进程连不上 models.dev 时页面依然可用。

## 名称重定向

第二个设置节「名称重定向」解决另一件事：网关用路径前缀区分上游
（`qoder/qfmodel`、`qoder-cn/qfmodel`），显示名称却沿用上游的
`Qwen3.8-Flash`，于是两个来源在模型选择器里长得一模一样。

规则是机械的：**取模型 ID 第一个 `/` 之前的前缀，清洗名称里所有该前缀的其他形态，
只保留末尾的全角 `【prefix】` 一种**。清洗包括：开头的 `qoder/`（网关常把 ID 原样
当名称返回）、早先那版半角 ` (qoder)`、以及重复应用留下的旧 `【qoder】`。
用全角括号是因为上游自己的名字里已经塞满半角括号（`Qwen3.8-Flash (0305)`），
再来一对半角就分不清哪段是来源、哪段是原名。

| 模型 ID | 原名称 | 新名称 |
| --- | --- | --- |
| `qoder/qfmodel` | `Qwen3.8-Flash` | `Qwen3.8-Flash【qoder】` |
| `qoder-cn/qfmodel` | `Qwen3.8-Flash` | `Qwen3.8-Flash【qoder-cn】` |
| `beichen/gpt-6-astra` | `beichen/gpt-6-astra` | `gpt-6-astra【beichen】` |
| `antigravity/gemini-3.8-flash` | `antigravity/Gemini 3.8 Flash` | `Gemini 3.8 Flash【antigravity】` |

- **幂等**：先剥再贴，重复应用不会叠成 `【qoder】【qoder】`，也不会把开头的
  `qoder/` 和末尾的 `【qoder】` 同时留下。
- **无前缀不动**：`standalone` 这类没有 `/` 的 ID 保持原样，也不可勾选。
- **名称留空时**用 ID 去掉前缀后的部分兜底：`qoder/unnamed` → `unnamed【qoder】`。
- 只写 `name` 字段：上下文窗口、图片能力、推理档位一概不碰；写入同样走
  `remote.settings.mutate`，同样处理 `settings/conflict`（重载后再确认）。
- 表格逐行展示「来源前缀 / 当前名称 / 新名称」，可按 ID 或名称搜索、
  只看有变化的行；不勾选的行不会被改写。

## 名称重定向

第二个设置节「名称重定向」解决另一件事：网关用路径前缀区分上游
（`qoder/qfmodel`、`qoder-cn/qfmodel`），显示名称却沿用上游的
`Qwen3.8-Flash`，于是两个来源在模型选择器里长得一模一样。

规则是机械的：**取模型 ID 第一个 `/` 之前的前缀，用全角 `【】` 包住，追加到显示名称末尾**。
用全角括号是因为上游自己的名字里已经塞满半角括号（`Qwen3.8-Flash (0305)`），
再来一对半角就分不清哪段是来源、哪段是原名。

| 模型 ID | 原名称 | 新名称 |
| --- | --- | --- |
| `qoder/qfmodel` | `Qwen3.8-Flash` | `Qwen3.8-Flash【qoder】` |
| `qoder-cn/qfmodel` | `Qwen3.8-Flash` | `Qwen3.8-Flash【qoder-cn】` |
| `group/all-in` | `all in` | `all in【group】` |

- **幂等**：名称已经带同名后缀时先剥掉再追加，重复应用不会叠成
  `【qoder】【qoder】`；早先那版半角 ` (qoder)` 也会被识别并改成全角形式。
- **无前缀不动**：`standalone` 这类没有 `/` 的 ID 保持原样，也不可勾选。
- **名称留空时**用 ID 去掉前缀后的部分兜底：`qoder/unnamed` → `unnamed【qoder】`。
- 只写 `name` 字段：上下文窗口、图片能力、推理档位一概不碰；写入同样走
  `remote.settings.mutate`，同样处理 `settings/conflict`（重载后再确认）。
- 表格逐行展示「来源前缀 / 当前名称 / 新名称」，可按 ID 或名称搜索、
  只看有变化的行；不勾选的行不会被改写。


## 安装

从 npm 安装（发布后）：

```sh
dsh plugin --profile web add dsh-model-capability-sync
```

**DSH 桌面版不要用命令行装**：桌面应用独占自己的 profile，CLI 改动不生效，
请在应用内 **设置 → 插件** 里安装。

从本地源码安装（开发用）：

```sh
dsh plugin --profile desktop add "link:D:/code/dsh-model-capability-sync"
```

装完重启 dsh，设置页会出现「模型能力同步」。

要求：`dsh` 运行时 `^0.2.1-rc.2`（写在 `package.json` 的 `engines.dsh`，宿主会据此做兼容检查）。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `src/index.ts` | 宿主半：RPC 通道 `preview`（目录能力）+ `live`（当前生效） |
| `src/catalog.ts` | models.dev 下载 / 缓存（内存 + 本机文件）/ 索引 |
| `src/match.ts` | 网关 id → 目录条目的匹配规则 |
| `src/sort.ts` | 模型排序（前缀分组 + 名称） |
| `src/mapping.ts` | 目录条目 → 能力字段（纯函数） |
| `src/client/` | 设置页（React 组件 + 文案） |
| `src/client/SyncSection.tsx` | 「模型能力同步」设置节 |

| `src/client/rename.ts` | 名称重定向规则（纯函数）；`redirectName/planNames/renameModels` |
| `src/client/shared.ts` | 两个设置节共享的配置读取工具与类型 |
| `scripts/` | 构建脚本 + 冒烟脚本 + 规则单元测试 |
| `docs/` | 需求、技术选型、设计规范、开发计划 |

## 开发

```sh
npm install
npm run typecheck      # 两端类型检查
npm run build          # lib/index.js + lib/client.js
node --experimental-strip-types scripts/smoke.mjs   # 真实目录冒烟（需联网）
npm run test:rename    # 名称重定向规则单元测试（离线）
```

## 里程碑

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 骨架、构建、文档 | ✅ |
| P1 | 目录拉取、匹配、映射、只读预览 | ✅ |
| P2 | 预览表 + 写入设置 | ✅ |
| P2.5 | 差异预览、筛选、排序、写入位置文案 | ✅ |
| P3 | 别名表、手动覆盖 | ⬜ |
| P4 | 迁移旧适配器的模型清单并停用它 | ⬜ |
| P5 | 打包发布（npm + 社区目录） | 🔄 仓库已就绪，待发布 |

发版步骤见仓库内的 `docs/publishing.md`。

## 已知边界

- models.dev 描述的是**官方模型**能力；中转网关背后实际路由到哪个上游，目录说了不算。
  本插件给的是"最可能的答案"，最终仍建议用一张真图验证。
- 未在目录中的模型（新模型、厂商自造别名）保持原样，可在 P3 的别名表里手工指定。

## 许可证

[MIT](LICENSE)
