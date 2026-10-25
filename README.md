# dsh-model-capability-sync

给已经配好的 DeepSeek Harness LLM 供应商**补全模型能力参数**，并顺手把模型列表的
**名称和顺序**整理清楚的插件。

它做三件事，都在同一个设置页里：

1. **补全能力**：拿你已配置的模型 id 去 [models.dev](https://models.dev) 查事实，把
   `上下文窗口 / 输出上限 / 是否支持图片 / 推理档位` 写回官方适配器的配置。
2. **重定向名称**：给每个模型的显示名称加上 `【供应商】` 前缀，同名模型一眼分得清。
3. **重排顺序**：按「供应商分组」或「名称字母序」重排模型列表，随时可重排一次。

**它不发任何推理请求，也不注册 LLM 路由**——调用仍然由官方插件负责。
名称重定向只改 `name` 字段，**模型 ID 始终不变**，所以实际调用、路由、计费都不受影响。

## 为什么需要它

中转网关（NewAPI、Cline、Trae 之类）的 `/models` 只返回模型 id，不告诉你上下文多大、
能不能吃图片。官方适配器把没声明的能力按"纯文本"处理，于是模型明明支持图片，
界面上却提示不支持。

另外，网关用路径前缀区分上游（`qoder/qfmodel`、`qoder-cn/qfmodel`），显示名称却沿用
上游的 `Qwen3.8-Flash`，于是两个来源在模型选择器里长得一模一样。本插件一并解决这两件事。

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

### 补全能力

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
- 「名称」列显示重定向后的名称（`【qoder】 Qwen3.8-Flash`），写配置前就能看到最终效果。
- 目录下载失败会重试 3 次，仍失败则回落到本机缓存
  `~/.dsh/model-capability-sync/catalog.json`，页面标注「正在使用本机缓存」。
  手动预热：`node --experimental-strip-types scripts/warm-cache.mjs`。
  宿主进程连不上 models.dev 时页面依然可用。

### 匹配规则

由严到松，命中哪一条会在「匹配方式」列标出来：

| 顺序 | 规则 | 例子 |
| --- | --- | --- |
| 1 | 精确 | `gemini-3.8-flash` |
| 2 | 忽略大小写 | `GLM-5.3` → `glm-5.3` |
| 3 | 版本点折叠 | `claude-sonnet-4.5` → `claude-sonnet-4-5` |
| 4 | 剥变体标记 | `gemini-3.8-flash-tiered` → `gemini-3.8-flash` |
| 5 | 前缀匹配 | `nemotron-3.5-lightning` → `nemotron-3.5-lightning-30b-a3b` |
| 6 | 逐段剥供应商前缀 | `cline/dots-studio/dots-3-note-preview:free` → `dots-studio/dots-3-note-preview` |
| 7 | 去经销商命名空间 | `raccoon/sn-glm-5-3` → `glm-5-3` |
| 8 | 显示名称 | `qoder/qfmodel`（名称 `Qwen3.8-Flash`）→ `Qwen3.8-Flash` |
| 9 | 别名（手工兜底） | 你自己配的 id 映射 |

**变体标记**包括销售点后缀与路由标签，会循环剥（网关常叠加多个）：

- 后缀（27 个）：`-high` `-low` `-medium` `-minimal` `-max` `-xhigh` `-thinking`
  `-preview` `-latest` `-chat` `-tiered` `-disabled` `-trial` `-official` `-free`
  `-stable` `-experimental` `-reasoning` `-it` `-instruct` `-base` `-pro` `-flash`
  `-mini` `-nano` `-small` `-large`
- 路由标签：`:free` `:beta` `:nitro` 等 `:xxx`
- 构建号：尾部纯数字，如 `kimi-k3-1` → `kimi-k3`

**版本分隔符双向折叠**：`.`、`-`、`_` 在数字之间视为同一写法。目录里 `sensenova-6.8-flash-lite`
是点号，而经销商给的 `sn-sensenova-6-8-flash-lite` 是横线，不折叠就永远对不上。

**去经销商命名空间**：有些聚合商在自己的池子前面加 2–4 个字母的标签
（`raccoon/sn-glm-5-3` 的 `sn-`）。`sn` 不是目录里的供应商 id，只是经销商的缩写。
规则只接受「剥掉标签后能**精确**命中目录」的情况，所以：

- `sn-glm-5-3` → `glm-5-3` ✅ 命中
- `raccoon-19b265` → 目录里没有 `19b265`，保持未匹配（**不会**瞎猜）
- `kimi-k3` 本身精确命中，不会被误当成 `kimi-` + `k3`

这些都不改变模型本身，所以也不该决定能力事实能不能查到。

**优先选第一方厂商**的目录条目（`openai`/`anthropic`/`google`/`deepseek`/`nvidia`…），
避免被聚合站的错误数字带偏；同分时取事实最全的条目。

**别名放在最后**：别名是手工兜底，若放在名称匹配之前，被别名处理过的名称会被所有
同名行继承，等于失效。

### 名称重定向

**自动应用到所有模型**，点一次「重定向」按钮即可，不需要逐行勾选。

规则是机械的：**取模型 ID 第一个 `/` 之前的前缀，清洗名称里所有该前缀的其他形态，
然后在名称最前面放一个全角 `【前缀】`**。没有前缀的 ID 归入 `【other】`。

| 模型 ID | 原名称 | 新名称 |
| --- | --- | --- |
| `qoder/qfmodel` | `Qwen3.8-Flash` | `【qoder】 Qwen3.8-Flash` |
| `qoder-cn/qfmodel` | `Qwen3.8-Flash` | `【qoder-cn】 Qwen3.8-Flash` |
| `beichen/gpt-6-astra` | `beichen/gpt-6-astra` | `【beichen】 gpt-6-astra` |
| `standalone` | `Bare` | `【other】 Bare` |

- **前缀在前**：列表按供应商分组时，来源一眼可见，不用看到名字末尾才发现。
- **幂等**：先剥再贴。开头的 `【qoder】`、开头的 `qoder/`、旧的末尾 `【qoder】`
  和半角 ` (qoder)` 都会被清掉，重复应用不会叠成 `【qoder】【qoder】`。
- **无前缀归 `【other】`**：不会被跳过，也不会散落各处。
- **名称留空时**用 ID 去掉前缀后的部分兜底：`qoder/unnamed` → `【qoder】 unnamed`。
- 用全角括号是因为上游自己的名字里已经塞满半角括号（`Qwen3.8-Flash (0305)`），
  再来一对半角就分不清哪段是来源、哪段是原名。
- 只写 `name` 字段：上下文窗口、图片能力、推理档位一概不碰；写入同样走
  `remote.settings.mutate`，同样处理 `settings/conflict`（重载后再确认）。

### 排序与重排

顶部「排序」下拉二选一，点「重排」按钮按当前选择把列表写回配置：

| 选项 | 行为 |
| --- | --- |
| `按模型前缀排序（分组）` | 先按 ID 前缀分组，组内按名称 —— 「谁提供什么」的视角 |
| `按重定向后【来源】名称排序` | 按 `【供应商】` 分组，组内按名称字母序 |

- 两种都是**供应商优先**：同来源的模型聚在一起，组内再按名称排。
- 比较忽略大小写（`Workbuddy` 与 `workbuddy` 不会拆成两组），末尾用原始 ID 兜底，
  所以每次重排结果完全一致。
- 未重定向的行按规则**预演**排序键，因此重定向与否排序结果相同。
- 补全能力、重定向、重排三个动作写入时都按当前排序落盘，列表顺序与配置顺序始终一致。

## 安装

从 npm 安装（发布后）：

```sh
dsh plugin --profile web add dsh-model-capability-sync
```

从本地 tarball 安装：

```sh
dsh plugin --profile web add /path/to/dsh-model-capability-sync-0.1.0.tgz
```

从本地源码安装（开发用）：

```sh
dsh plugin --profile web add /path/to/dsh-model-capability-sync
```

**DSH 桌面版不要用命令行装**：桌面应用独占自己的 profile，CLI 改动不生效，
请在应用内 **设置 → 插件** 里安装。

装完重启 dsh，设置页会出现「模型能力同步」。

要求：`dsh` 运行时 `^0.2.1-rc.2`（写在 `package.json` 的 `engines.dsh`，宿主会据此做兼容检查）。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `src/index.ts` | 宿主半：RPC 通道 `preview`（目录能力）+ `live`（当前生效） |
| `src/catalog.ts` | models.dev 下载 / 缓存（内存 + 本机文件）/ 索引 |
| `src/match.ts` | 网关 id → 目录条目的匹配规则（八级阶梯） |
| `src/mapping.ts` | 目录条目 → 能力字段（纯函数） |
| `src/sort.ts` | 模型排序（前缀分组 / 重定向后名称） |
| `src/client/apply.ts` | 注册设置节、样式、RPC 与 settings 注入 |
| `src/client/SyncSection.tsx` | 设置页主体（能力表 + 重定向 + 重排） |
| `src/client/rename.ts` | 名称重定向规则（纯函数） |
| `src/client/shared.ts` | 配置读取工具与共享类型 |
| `src/client/locale.ts` | 界面文案（zh / en 逐键镜像） |
| `scripts/` | 构建、冒烟、发布检查、规则单元测试 |
| `docs/` | 需求、技术选型、设计规范、开发计划、发版 |

## 开发

```sh
npm install
npm run typecheck        # 两端类型检查
npm run build            # lib/index.js + lib/client.js
npm run verify:package   # 发布卫生检查（25 项）

# 单元测试（离线，不需要 profile 或网络）
npm run test:rename      # 名称重定向规则（11 条）
npm run test:match       # id 匹配规则（25 条）
npm run test:sort        # 两种排序（6 条）

# 真实目录冒烟（需联网）
node --experimental-strip-types scripts/smoke.mjs
```

## 里程碑

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 骨架、构建、文档 | ✅ |
| P1 | 目录拉取、匹配、映射、只读预览 | ✅ |
| P2 | 预览表 + 写入设置 | ✅ |
| P2.5 | 差异预览、筛选、排序、写入位置文案 | ✅ |
| P2.6 | 名称重定向（自动加 `【供应商】`，含 `【other】` 兜底） | ✅ |
| P2.7 | 排序二选一 + 一键重排 | ✅ |
| P2.8 | 匹配规则扩展（变体标记 / 前缀 / 构建号 / 多级命名空间） | ✅ |
| P3 | 别名表、手动覆盖 | ⬜ |
| P4 | 迁移旧适配器的模型清单并停用它 | ⬜ |
| P5 | 打包发布（npm + 社区目录） | 🔄 仓库已就绪，待发布 |

发版步骤见仓库内的 `docs/publishing.md`。

## 已知边界

- models.dev 描述的是**官方模型**能力；中转网关背后实际路由到哪个上游，目录说了不算。
  本插件给的是"最可能的答案"，最终仍建议用一张真图验证。
- **前缀匹配是唯一可能误判的规则**：`north-mini-code` 同时能匹配
  `north-mini-code-1-0` 和 `north-mini-code-free`。按「第一方优先 + 事实最全」取舍，
  界面上标为「前缀匹配」，可信度自行判断。
- 纯代号且没有显示名称的模型无法推断，例如 `1fmodel`；目录里确实没有的模型
  （新模型、厂商自造别名）保持原样，可在 P3 的别名表里手工指定。
- 名称重定向只改显示名称，**不改模型 ID**。若某个客户端只认 ID 而忽略名称，
  重定向对它不可见。

## 许可证

[MIT](LICENSE)
