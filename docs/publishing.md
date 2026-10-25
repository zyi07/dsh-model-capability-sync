# 发版手册

本文件是"把这个插件交给别人装"的完整操作手册。发布动作本身需要维护者的
npm 账号，仓库里只做准备工作。

## 1. 发布前检查清单

- [ ] `npm run typecheck` 通过（宿主 + 浏览器两端）
- [ ] `npm run test:rename && npm run test:match && npm run test:sort` 全绿（35 条）
- [ ] `npm run verify:package` 通过（25 项自检：清单字段、产物存在、patch 内容、
      client 包装、宿主零第三方 import）
- [ ] `npm run build` 通过，且 `lib/index.js`、`lib/client.js` 是刚构建的
- [ ] `npm run pack:check` 清单正确：含 `lib/`、`src/`、`scripts/`、
      `cordis.patch.yml`、`LICENSE`、`README.md`；不含 `node_modules/`
- [ ] `package.json` 的 `engines.dsh` 与实测运行时一致
- [ ] README 的安装命令与实际包名一致
- [ ] `git status` 干净，`lib/` 已提交（git 直装需要它）

## 2. 一次性准备

`package.json` 里已经填好仓库信息（`npm run verify:package` 会校验）：

```json
"repository": { "type": "git", "url": "git+https://github.com/zyi07/dsh-model-capability-sync.git" },
"homepage": "https://github.com/zyi07/dsh-model-capability-sync#readme",
"bugs": { "url": "https://github.com/zyi07/dsh-model-capability-sync/issues" }
```

npm 账号侧：`npm login`，并开启 2FA（发布时会被要求输入一次性密码）。

## 3. 发版

```sh
npm version patch          # 或 minor / major，会自动改 version 并打 tag
npm run pack:check         # 再看一眼清单
npm publish                # prepublishOnly 会自动跑 typecheck + build
git push --follow-tags
```

`publishConfig.access` 已经是 `public`，非 scoped 包默认也是公开，这里只是显式声明。

## 4. 验证

```sh
npm view dsh-model-capability-sync version
dsh plugin --profile web add dsh-model-capability-sync   # 换一个干净 profile，别动 desktop
```

装完重启 dsh，设置页应出现「模型能力同步」。

## 5. 让所有人能发现

### 5.1 社区目录（推荐）

插件市场 `dshmarket` 的列表来自
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。
投稿方式是 **一个插件一个 YAML 文件**，文件名 `data/plugins/<owner>__<repo>.yml`
（README 是脚本生成的，不要手改；也不要往 `dsh-market/dsh-market` 或
`dsh-plugin-catalog` 提 PR，那两个分别是市场应用和自动生成的产物）。

要提交的文件内容：

```yaml
# data/plugins/zyi07__dsh-model-capability-sync.yml
url: https://github.com/zyi07/dsh-model-capability-sync
name: zyi07/dsh-model-capability-sync
category: model
description:
  en: 'Fills context window, output cap, image input and reasoning efforts from models.dev into an already-configured DeepSeek Harness LLM provider, previewing every field change before writing.'
  zh: '从 models.dev 为已配置的 DeepSeek Harness LLM 供应商补齐上下文窗口、输出上限、图片输入与推理档位，写入前逐字段预览差异。'
```

- `category` 用 `model`（Models & Providers / 模型与账号接入）。可选值：
  `agi, ui, usage, theme, model, identity, session, memory, tools, wsl, browser,
  vision, voice, docs, skill, workflow, git, notify, dev, security, remote, market, fun`。
- 描述里出现 `: `（冒号加空格）必须加引号，否则 YAML 解析失败。
- 描述必须**属实**，维护者会拿它跟代码核对；不要写营销词。

提交前逐条对照他们的硬性要求：

| 要求 | 本仓库 |
| --- | --- |
| `package.json` 声明 `dsh.bundle`（只有 `dsh.client` 不算） | ✅ |
| 仓库根有 `cordis.patch.yml` 且是 `insert` 形式 | ✅ |
| 有真实可用的代码 | ✅ |
| **仓库创建满 1 天**（CI 自动检查） | ⏳ 2026-10-21 16:52 建库，**2026-10-22 16:52 之后**才合格 |
| 仓库加 `dsh-plugin` topic | ⬜ 在仓库 About 里添加 |
| 描述属实、分类贴合 | ✅ |
| 官方 `@deepseek-ai/*` 用 `peerDependencies` 而不是 `dependencies` | ✅ |
| 发布到 npm（预构建安装可跳过 `allowBuilds` 构建授权） | ✅ 0.1.0（0.2.0 待发布） |

收录后会出现在两处：站点 `https://awesome-dsh-plugin.com/p/zyi07/dsh-model-capability-sync/`，
以及插件市场（`index.json` 格式 1 索引，DSH 0.2.1+ 的「插件 → 发现」读的就是它）。

### 5.2 自建市场索引（备用）

DSH 的发现页读取"格式 1"索引，用户把 URL 加到 **插件 → 发现 → 索引源** 即可。
把下面的 JSON 放到任意 http(s) 静态地址（GitHub Pages、jsDelivr 等）：

```json
{
  "format": 1,
  "title": "dsh-model-capability-sync",
  "description": { "en": "Model capability sync for DeepSeek Harness", "zh": "模型能力同步" },
  "plugins": [
    {
      "name": "dsh-model-capability-sync",
      "title": { "en": "Model capability sync", "zh": "模型能力同步" },
      "description": {
        "en": "Fill context window, output cap, image input and reasoning efforts from models.dev into your configured provider.",
        "zh": "从 models.dev 补齐上下文窗口、输出上限、图片输入、推理档位。"
      },
      "versions": [
        {
          "version": "0.1.0",
          "publishTimestamp": 1792650000,
          "source": { "type": "npm" },
          "engines": { "dsh": "^0.2.1-rc.2" }
        }
      ]
    }
  ]
}
```

硬性要求（来自 `@deepseek-ai/dsh-plugin-market-index` 的校验器）：

- `format` 必须是 `1`；
- 索引 URL 只能是 `http(s)`，不能带凭据、查询串或 `#`；
- `title` 必须有 `en` 键，其余语言键用小写语言 id；
- `version` 是精确 SemVer，`publishTimestamp` 是 Unix **秒**；
- `source.type` 为 `npm`（可带 `registry`）或 `git`（必须带 40 位 commit，
  可带 `path` 指向子目录）；
- 每个插件 `name` 必须是合法 npm 包名，同一索引内不能重复。

## 6. 版本与兼容

- `engines.dsh` 决定宿主是否接受：当前 `^0.2.1-rc.2`。宿主版本落在范围外时，
  DSH 会给出兼容性警告并拒绝安装（可用 `dsh plugin allow-version` 逐版本豁免）。
- 破坏性改动（配置字段、写入语义）升 **minor**；纯修复升 patch。
  本插件独立版本线，不跟随宿主版本号。
- 目标宿主升级后，先在真实 GUI 验证一遍再放宽 `engines.dsh`。

### 版本状态

| 版本 | 状态 | 含有什么 |
| --- | --- | --- |
| 0.1.0 | **已发布到 npm** | 能力补全、预览表、写入、差异预览、排序（单模式） |
| 0.2.0 | **本地已完成，未发布** | 名称重定向（`【供应商】`）、排序二选一 + 一键重排、匹配规则扩展（变体标记 / 前缀 / 构建号 / 多级命名空间 / 版本点）、名称降级匹配 |

发布 0.2.0 前需要把 `package.json` 的 `version` 改成 `0.2.0`（当前仓库里还是
`0.1.0`，因为尚未执行 `npm version`）。

本地离线分发：`npm pack` 产出 `.tgz`，拷到目标机器用
`dsh plugin add /path/to/dsh-model-capability-sync-0.2.0.tgz` 安装。

## 7. 出问题怎么办

npm 的已发布版本**不能删除**，只能废弃：

```sh
npm deprecate dsh-model-capability-sync@0.1.0 "改用 0.1.1：修复了写入顺序"
```

然后发一个修复版本。用户侧更新：桌面版在 **设置 → 插件** 里更新；
市场装的可一键更新。

## 8. 两个坑

1. **桌面版不能用命令行装**。官方 Desktop App 独占自己的 profile，CLI 改了不生效，
   必须走应用内 **设置 → 插件**。README 里两条路径都写了。
2. **`lib/` 必须提交进仓库**。插件加载的是构建产物，不是源码；git 直装时
   没有构建步骤，产物缺了就装了个空壳。
