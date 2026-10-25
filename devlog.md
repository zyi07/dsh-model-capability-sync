# 开发日志

> 记录做了什么、为什么这么做、踩过什么坑。倒序排列，最新在上。
> 当前的代码事实以 `README.md` 与 `docs/` 为准；本文件保留决策过程与教训。

## 现状速览（2026-10-25）

| 项 | 值 |
| --- | --- |
| 版本 | `0.1.0`（npm 已发布）；名称重定向、排序、匹配扩展已在本地完成，尚未发 `0.2.0` |
| 设置节 | **1 个**（`model-capability-sync`，order 16） |
| 表头列 | 勾选 / 模型 ID / **名称** / 匹配 / 上下文 / 输出 / 图片 / 当前生效 / 推理档位 |
| 按钮 | 分析能力、重新下载目录、**重定向**、**重排**、应用 |
| 排序 | `prefix`（按 ID 前缀分组）/ `redirected`（按 `【供应商】` 分组），均供应商优先 |
| 匹配阶梯 | 精确 → 版本分隔符 → 剥变体标记 → 前缀 → 逐段剥前缀 → 去经销商命名空间 → 显示名称 → 别名 |
| 名称重定向 | 自动、全量、前缀在**最前**、无前缀归 `【other】`、幂等、只写 `name` |
| 测试 | 42 条（match 25 / rename 11 / sort 6），`npm run verify:package` 25 项 |
| 目录实测 | 230 个供应商 / 8888 个模型，100% 带 `modalities` |

---

## 2026-10-25

### 经销商命名空间识别（`sn-glm-5-3` → `glm-5-3`）

- 用户截图：`raccoon/sn-glm-5-3` 等一批 id 未匹配，而目录里明明有 `glm-5.3`。
- 归因：经销商在自己池子前加 2–4 字母标签。**`sn` 不是目录里的供应商 id**
  （查过：`sn` 只匹配到 `snowflake-cortex`，纯属巧合），所以不能靠"短前缀 = 供应商"推断。
- 另一类问题：版本分隔符写法不一致——目录里是 `sensenova-6.8-flash-lite`（点），
  经销商给的是 `sn-sensenova-6-8-flash-lite`（横线），单向下划线转横线永远对不上。
- 改动 `src/match.ts`：
  - `VENDOR_PREFIX` + `peelVendorNamespace`：剥 2–4 字母标签，**但只有剥后能精确命中
    目录才接受**。这条护栏是必须的——无条件剥离会把 `raccoon-chat-ml-5-5` 拆成
    无意义的 `chat-ml-5-5`。
  - `foldVersionDots` → `versionSpellings`：`./-/ _` 双向互换，返回三种拼写依次试。
  - `resolveId` 重构为 `lookupExact`（精确 + 大小写 + 版本拼写）+ 剥标记 + 前缀 + 剥经销商。
  - `MatchVia` 加 `vendor`，界面显示「去供应商前缀」。
- 实测（真实目录 8929 个模型）：
  - 命中 5 个：`sn-glm-5-3`、`sn-glm-5-3-flash`、`sn-kimi-k3`、`sn-deepseek-v4-1-flash`、
    `sn-deepseek-v4-1-flash-1017`、`sn-sensenova-6-8-flash-lite`
  - **对照组全部正确**：`kimi/kimi-k3` 仍精确命中自己，没被误剥成 `k3`；
    `DeepSeek-Flash` 正确选中第一方 `deepseek/deepseek-flash` 而非聚合站 `302ai`
  - 仍 miss 的是目录里确实没有的：`sn-sensenova-6-8-flash`（只有 `-lite`）、
    `raccoon-19b265`/`405a1c`/`8c4485`/`chat-ml-5-5`、`GLM3.5-Flash`（目录无 3.5 代 GLM）
- 测试 match 18 → **25 条**（新增 7 条：剥离成功、剥后仍剥构建号、分隔符双向、
  剥不成不瞎猜、本身像前缀的模型不被剥、精确优先于剥离、第一方优先）。
- 全套 42 条全绿，typecheck/build/verify 通过，bundle 已部署。

### 全部文档对齐代码

用户要求"所有文档全部按照代码现状编写修改"。逐份核对后发现：

- `README.md` 有**两个重复的「名称重定向」小节**，且都描述旧设计（前缀在末尾、
  无前缀不动）；目录结构表被一个空行切成两半；安装命令还写着 Windows 路径。
- `docs/requirements.md` 需求编号乱序（F10 在 F11/F12 之后），内容同样是旧设计。
- `docs/design-guide.md` 布局图没有「名称」列、排序下拉、重定向/重排按钮。
- `docs/development-plan.md` 写着"不写 `name`"和"不放宽匹配规则"——两条都已被推翻。
- `docs/tech-stack.md` 引用 9165 个模型（旧缓存），未记录新增的实现选择。
- `docs/publishing.md` 写"22 项自检"，实际 25 项；未记录 0.2.0 未发布。

全部重写。期间自查发现自己在三份文档里把后缀表写成"24 个词"，脚本数出来是 **27 个**，
已改正。所有数字（测试条数、verify 项数、目录规模）都是跑命令得到的，不是凭记忆。

提交 `d4a61be`、`6f11355`。

**顺带清掉代码里的死文案**：核对时发现 `locale.ts` 有 22 个键无人引用——
全部来自已删除的 `RenameSection`（`navRedirect`、`colPrefix`、`colNameBefore`、
`colNameAfter`、`redirectIntro`、`redirectRule` 等）和已取消的「同时重排」开关
（`redirectRearrange`、`redirectRearranged`、`redirectSortHint`）。
文案键从 79 个降到 68 个，现在**零未引用**，zh/en 仍逐键镜像（typecheck 通过）。

### 匹配规则扩到变体后缀 / 前缀 / 构建号

- 用户反馈（截图）：未匹配列表里很多只是加了后缀，模型能力其实一样。
- 归因（37 个 id 逐条分析）：五类差异——
  - 销售点后缀（`-tiered`/`-disabled`/`-trial`/`-official`/`-free`/`-it`/`-reasoning`）
  - 路由标签（`:free`）
  - 尾部被截断（`nemotron-3.5-lightning` vs `...-30b-a3b`）
  - 构建号（`kimi-k3-1`）
  - 多级命名空间（`cline/dots-studio/...`）
- 改动 `src/match.ts`：`stripMarkers`（路由标签 + 27 词后缀表 + 构建号，循环剥）、
  `foldVersionDots`（`4.5`→`4-5`）、`prefixesOf`（惰性前缀索引）、
  `matchModel` 逐段剥前缀；`MatchVia` 加 `prefix`，界面显示「前缀匹配」。
- 实测：37 个 id 从 0 → **34 匹配**（剩 3 个是 id 里根本没有模型名、
  或目录里确实没有的）。
- 测试 test-match 9 → 18 条，全套 35 条全绿；提交 `520bec8`。

### 排序算法两次返工

**第一次**（`74b0cd2`）：用户反馈重排后顺序仍乱。原因：配置里名称混着
`【】`/`()`/`[]` 三种标注（不同时期写入），`redirectedLabel` 只剥匹配 ID 前缀的
` (prefix)`，其余留在排序键里污染比较。改为递归剥除所有尾部括号对。

**第二次**（`2dd5746`）：用户反馈"按照框【】里面的供应商去排序"——不是按名称字母序。
推翻 `redirectedLabel(id, name): string` 的单键设计，改为
`redirectedSortKey(id, name): [prefix, name]` 二元组：第一级供应商、第二级模型名。
`compareRedirected` 相应改两级比较。

**教训**：排序键必须是"用户读到的那个维度"。我先按名称排，用户要的是按来源分组——
两个都合理，但需求说的是后者。多问一句比返工两次便宜。

## 2026-10-24

### 自动重定向 + `【other】` 分组

- 用户要求："所有模型都自动重定向名称，有前缀的把前缀当供应商，没前缀的放到 `【other】` 组内"。
- 改动：`redirectName` 改为**必定**返回 `changed=true`（无前缀用 `other`）；
  `【】` 放在名称**最前面**（此前在末尾）；`doRename()` 改为全量应用，不再逐行勾选。
- 提交 `fdc7fa5`、`93004e4`、`5a24811`。

### 合并成一个设置节

- 用户反馈"两个功能太割裂"，要求名称重定向作为能力补全节下的子操作。
- 删除 `src/client/RenameSection.tsx`；`apply.ts` 只注册一个 section；
  `SyncSection` 新增 `doRename()` 与 `doReorder()`，各自一键执行。
- 提交 `69b83f7`、`143fb4c`。

## 2026-10-23

### 名称降级匹配 + 两种排序

- 用户要求：匹配不上的模型，用右侧「真实名称」再试一次。
- `PreviewRequest` 加 `names`，客户端把 `id → name` 一起发给宿主；`matchModel` 新增
  `name` 参数；`cleanDisplayName` 剥掉名称里的来源标注，**因此重定向与否解析结果一致**。
- 新增 `MatchVia: 'name' | 'nameSuffix'` 与 `matchedName` / `nameSource`，
  界面显示「按名称 / 名称去变体」。
- 别名挪到阶梯最后：它会被每一行通过名称继承，放前面等于失效。
- 提交 `9894538`。

### 名称重定向成型（三次调整）

1. 首版：独立设置节，前缀追加到**末尾**（`Qwen3.8-Flash (qoder)`）。
2. 用户要求括号改全角：`Qwen3.8-Flash【qoder】`；旧半角形式自动迁移。提交 `2b44141`、`52e0c17`。
3. 用户要求清洗已有前缀：先剥开头的 `prefix/`（网关常把 ID 原样当 label，profile 实测
   53 个）、旧半角 ` (prefix)`、重复的 `【prefix】`，再统一贴一个。提交 `2a4111e`。

## 2026-10-21

### 立项

把「维护一个完整 LLM 适配器」改为「只做能力补全的旁路插件」。调用交给官方
`@deepseek-ai/dsh-llm-pi-ai`，本插件只负责查目录、算字段、写配置。

### P0 骨架

- `package.json`（`dsh.bundle.patch` + `dsh.client` 双端声明，零运行时依赖）
- `cordis.patch.yml`（插入插件行，不注册 LLM 路由）
- `tsconfig.json`（宿主）/ `tsconfig.client.json`（浏览器）
- `scripts/build-host.mjs`（esbuild → 单文件 ESM）
- `scripts/build-client.mjs`（esbuild → `window.__ModuleLoader__.load` 模块工厂）

### P1 宿主核心

- `catalog.ts`：models.dev 下载 + 6 小时内存缓存 + 精确/折叠双索引；代理走可选
  `undici` 动态导入
- `match.ts`：五级匹配 + 第一方厂商优先
- `mapping.ts`：`modalities.input → input`、`limit.context → contextWindow`、
  `limit.output → maxTokens`、`reasoning_options[effort] → reasoningEfforts`
- `index.ts`：RPC 通道 `/model-capability-sync` 的 `preview` 端点

### P2 浏览器半

设置页（写入位置 / 供应商 / 模型表 / 勾选 / 覆盖开关 / 应用），
写入走 `remote.settings.mutate` 的 `set ['providers', key, 'models']`。

### 装进 profile 后的四个缺陷（均已修）

**1. `list.filter is not a function`**
`remote.settings.describe()` 返回的是**信封** `{ok:true, value:{writable, namespaces:[…]}}`，
不是命名空间数组。修：`refusalOf` / `unwrap` / `namespacesOf` 统一拆信封，
数组和信封两种形状都接受；`mutate` 的拒绝原因显示到页面。

**2. `input: []` 被当成「已填过」**
配置 schema 给没声明的字段补默认值，`input` 的默认是 `[]`。原来的"只填空白"
只把 `undefined` 当空白，于是 74 个模型里 73 个的 `input` 被跳过。
修：`isBlank()` —— `undefined` / `''` / `[]` / `{}` 都算空白；`false` 和 `0` 是明确决定。

**3. `fetch failed`**
目录下载只有一次机会，models.dev 一失败整页不可用。修：重试 3 次（间隔 600ms），
仍失败回落本机缓存 `~/.dsh/model-capability-sync/catalog.json`，响应带 `stale: true`，
页面标注「正在使用本机缓存」；新增 `scripts/warm-cache.mjs` 预热。

**4. 路由被抢占（诊断列）**
配置文件写对了，聊天仍报"不支持图片"——因为同一 provider 路由被另一个插件抢先注册
（`dsh-llm` 对同一路由第二次注册抛 `DUPLICATE_ADAPTER`，只有先注册的生效）。
修：宿主新增 `live` 端点，用 `ctx.llm.resolveModelInfo()` 读**真正接管该路由**的适配器
此刻上报的值；页面新增「当前生效」列。两列不一致 = 路由被别的插件占着。

### P2.5 体验完善

- 差异预览：每个单元格 `旧值 → 新值`，顶部汇总"将修改 N 行 · M 个字段"
- 搜索 +「只看有变化的」；未变化的行不可勾选
- 写入后自动刷新「当前生效」列
- 粘性表头 + 滚动容器（`max-height: 460px`）
- 未匹配行显示 `reason`
- 自动排序（新文件 `src/sort.ts`）
- **写入位置不暴露插件 id**：显示「原生配置 · pi-ai 适配器」，来源来自内置映射表
  `TARGET_DIRECTORY`，不靠 id 前缀猜；只有一个可写目标时不渲染下拉
- 修 bug：切换写入位置时残留上一个目标的模型列表 → 统一走 `showProvider(ns, key)`
- 修 bug：`settings/conflict` 改为重读最新配置并提示重试，**故意不自动重试**
  （盲目重试会覆盖别人刚保存的内容）

### 一条被推翻的规则（教训）

批次一最初加了「`name === id` 视为占位符、用目录名覆盖」这条规则，用户明确反对
（"让你排序没让你改模型名称"）。已回退，并把整条改名路径封掉。

后来用户**主动要求**改名（名称重定向），于是改名成为独立动作、只写 `name`、
与能力补全分离——这样两个决定都成立：能力补全永远不改名，重定向只做改名。

### P5 发版

- `LICENSE`（MIT）
- `package.json`：`engines.dsh: ^0.2.1-rc.2`、`publishConfig.access: public`、
  `peerDependenciesMeta` 把 `@deepseek-ai/cordis` 和 `react` 标成 optional、
  `prepublishOnly`（typecheck + build + verify）；删掉指向不存在文件的 `types` 字段
- `scripts/verify-package.mjs`（当时 22 项，后加到 25 项）
- `npm pack` 产物在干净目录 `npm install` 后验证通过
- **2026-10-21 发布 `dsh-model-capability-sync@0.1.0` 到 npm**

### 分发机制调研（写进 `docs/publishing.md`）

- `dsh plugin add` 接受四类 spec：npm 包名、git URL/简写、tarball、`link:`
- 官方发现页的 `indexes` **默认是空数组**——不发索引源就没有任何市场请求
- 社区目录走 `awesome-dsh-plugin` 的 PR，**一个插件一个 YAML**，README 由脚本生成
- 市场索引是"格式 1" JSON：`format: 1`、`title` 必须有 `en` 键、
  `publishTimestamp` 是 Unix 秒、`source.type` 为 `npm` 或 `git`
- 兼容性由 `engines.dsh` 单独决定，声明了就忽略 `peerDependencies` 里的 `@deepseek-ai/dsh*`
- 投稿门槛：仓库创建满 1 天（CI 查）+ 仓库加 `dsh-plugin` topic

## 待办

- [ ] 发 `0.2.0`（含名称重定向、排序、匹配扩展）
- [ ] 向 `awesome-dsh-plugin` 提 PR 收录
- [ ] P3：别名表（救回 `1fmodel` 这类纯代号）+ 单模型手动编辑
- [ ] P4：停用 `dsh-llm-newapi`，让 `llm-pi-ai` 独占路由（图片能力才会真正进请求链路）
