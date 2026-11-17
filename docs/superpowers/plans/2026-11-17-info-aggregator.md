# 行业资讯聚合器 v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出一个 Mac 桌面应用，能建项目/信息源、用真实浏览器半自动抓取小红书（搜索→翻页→点开读图文）、去重续抓，并把结果拼成可视化图文报告，配合 AI 两种汇总模式。

**Architecture:** Electron 应用：main 进程持有 Playwright（抓取）、本地存储、密钥；renderer（React）做 UI；两者经 typed IPC + preload 桥通信。抓取引擎按「配方（Recipe）」接口组织，v1 实装小红书配方 + 通用网址配方。纯逻辑模块（存储、去重/排序/过滤、解析、报告、AI 打包）走 TDD；浏览器与 UI 部分走集成/手动验收。

**Tech Stack:** Electron, electron-vite, React + TypeScript, Playwright（自带 Chromium 内核）, Vitest（测试）, Electron safeStorage（API key）。本地存储用自写 JSON store。

**Spec:** `docs/superpowers/specs/2026-11-17-info-aggregator-design.md`

## Global Constraints

- 平台：macOS（Apple 芯片优先）；桌面客户端，终端用户不碰代码。
- 浏览器内核：应用自带独立 Chromium（Playwright），**不借用用户日常 Chrome**；内核需内置或走国内镜像源分发。
- 不自动填密码/验证码；首次登录由用户手动完成，登录态存入**按「身份」隔离的持久化 profile 目录**（一个身份 = 某站点某账号）。
- 小红书读取详情**一律点击卡片打开浮层**，禁止直接 goto 笔记 URL。
- 评论默认**不抓**；视频默认只取封面图+可播放链接，不下载完整视频。
- 可视化报告**始终由应用生成、不依赖 AI**；AI 综述为可选的额外一段。
- 多源运行默认**串行**（单浏览器、一次一个源）。
- 抓取「配方」为独立可更新模块；预留登录/授权校验位（本期不实现）。

## Review Focus

- **登录超时/用户走开**：登录轮询到上限仍未登录时，引擎须优雅停止并给出明确提示，绝不无限挂起。→ 测试挂在 Task 5（session manager 的 `waitForLogin` 超时返回 `false`）。
- **单条笔记被「安全限制」拦**：点开浮层后内容为空/命中风控文案时，跳过该条、继续下一条，报告标记为部分成功。→ 测试挂在 Task 5（detail 解析器遇风控文案返回 `blocked: true`）。
- **选择器失效/零结果**：卡片选择器匹配不到任何元素时，返回空列表并上报"未抓到内容"，不抛未捕获异常使应用崩溃。→ 测试挂在 Task 5（card 解析器对空 HTML 返回 `[]`）。
- **取不到稳定 ID / 全部已抓**：卡片无官方 ID 时退化为「标题+作者+日期」指纹；续抓时全部命中去重则报告"无新内容"。→ 测试挂在 Task 3（`selectItems` 去重与 `itemFingerprint` 回退）。
- **AI key 失效/网络错误**：API 模式下调用失败时给出清晰错误，且**已抓数据与报告不丢失**（报告先于综述生成）。→ 测试挂在 Task 9（`summarize` 失败路径不影响已存报告）。

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: 可运行的 Electron+React 骨架；`npm run dev` 开窗，`npm test` 跑 Vitest。

- [ ] **Step 1:** 用 electron-vite 约定建目录结构与三个入口（main/preload/renderer），React 渲染一个占位页面。
- [ ] **Step 2: 写冒烟测试** `tests/smoke.test.ts`：`expect(1 + 1).toBe(2)`，确认 Vitest 可跑。
- [ ] **Step 3:** 运行 `npm test`，Expected: PASS。
- [ ] **Step 4:** 运行 `npm run dev`，Expected: 弹出 Electron 窗口显示占位页面。
- [ ] **Step 5: Commit** `chore: scaffold electron + react + vitest`

---

### Task 2: 共享类型与本地存储

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/main/store/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Produces（`src/shared/types.ts`，后续任务按此命名，勿改）：

```ts
export type SourceType = 'search' | 'fixed-url';
export type ContentType = 'image' | 'gif' | 'video' | 'text';
export type SortKey = 'likes' | 'latest';

export interface ScrapeConfig {
  count: number;
  contentTypes: ContentType[];
  includeComments: boolean;   // 默认 false
  sort: SortKey;
  timeRangeDays: number | null; // null=不限；按 item.date 过滤
}
export interface Identity { id: string; label: string; site: string; profileDir: string; }
export interface Source {
  id: string; type: SourceType; site: string;
  keywordOrUrl: string; identityId: string | null;
  config: ScrapeConfig; seenItemIds: string[];
}
export interface Project { id: string; name: string; sourceIds: string[]; }
export interface ScrapedItem {
  id: string; sourceId: string; title: string; author: string; date: string;
  likes: number; url: string; images: string[]; videoCover?: string;
  videoUrl?: string; text: string; comments: string[]; blocked?: boolean;
}
```

- Produces（`store.ts`）：`createStore(dir: string)` 返回一个对象，含 `projects`/`sources`/`identities`/`settings` 各自的 `getAll()`, `get(id)`, `upsert(entity)`, `remove(id)`；数据持久化为 `dir` 下 JSON 文件，构造时若文件不存在则初始化为空。

- [ ] **Step 1: 写失败测试** `tests/store.test.ts`：在临时目录建 store，`upsert` 一个 Project 后新建同目录 store，`getAll()` 能读回该 Project；`remove` 后读不到。断言字段完全一致。
- [ ] **Step 2:** 运行测试，Expected: FAIL（`createStore` 未定义）。
- [ ] **Step 3:** 实现 `createStore`，JSON 文件读写，原子写（写临时文件后 rename）。
- [ ] **Step 4:** 运行测试，Expected: PASS。
- [ ] **Step 5: Commit** `feat: shared types + local json store`

---

### Task 3: 选取逻辑（去重 / 排序 / 时间过滤）

**Files:**
- Create: `src/main/engine/select.ts`
- Test: `tests/select.test.ts`

**Interfaces:**
- Consumes: `ScrapedItem`, `ScrapeConfig`, `Source.seenItemIds`（Task 2）。
- Produces:
  - `itemFingerprint(item: Pick<ScrapedItem,'title'|'author'|'date'>): string` — 无官方 ID 时的回退指纹。
  - `selectItems(candidates: ScrapedItem[], config: ScrapeConfig, seenIds: string[]): ScrapedItem[]` — 剔除 seen（按 `id`，id 为空则按 fingerprint）、按 `config.sort` 排序、按 `timeRangeDays` 过滤、截取前 `count` 条。

- [ ] **Step 1: 写失败测试** `tests/select.test.ts`：
  - 按 likes 降序取前 N；
  - seenIds 命中的被剔除；
  - `timeRangeDays=120` 时过滤掉更早日期；
  - 全部 seen → 返回 `[]`；
  - 无 id 的两条但指纹相同 → 视为重复。
- [ ] **Step 2:** 运行测试，Expected: FAIL。
- [ ] **Step 3:** 实现 `itemFingerprint`（拼接后 hash）与 `selectItems`。日期解析在 `src/main/engine/date.ts`，把小红书 `MM-DD`/`MM-DD 地区`/`YYYY-MM-DD` 归一到年份（无年份时按"最近一次该月日"推断年份）。
- [ ] **Step 4:** 运行测试，Expected: PASS。
- [ ] **Step 5: Commit** `feat: dedup/sort/time-filter selection`

---

### Task 4: Playwright 会话管理器

**Files:**
- Create: `src/main/browser/session.ts`
- Test: `tests/session.manual.md`（手动验证清单，非单测）

**Interfaces:**
- Consumes: `Identity.profileDir`（Task 2）。
- Produces:
  - `launchSession(profileDir: string): Promise<Session>`，`Session` 暴露 `page`, `context`, `close()`；用 `chromium.launchPersistentContext`（自带内核、`headless:false`、最大化）。
  - `waitForLogin(page, loginSelector, timeoutMs): Promise<boolean>` — 轮询登录指示元素，到上限返回 `false`（见 Review Focus：超时须优雅返回，不抛不挂）。

- [ ] **Step 1:** 实现 `launchSession` 与 `waitForLogin`（固定步长轮询；达到 `timeoutMs` 返回 false）。
- [ ] **Step 2:** 写 `tests/session.manual.md`：记录「启动→停在首页→手动登录→检测到登录态→`waitForLogin` 返回 true」「不登录等满超时→返回 false 且进程不挂」两条手动步骤与预期。
- [ ] **Step 3:** 按清单手动执行一次，勾选通过。
- [ ] **Step 4: Commit** `feat: playwright persistent session manager`

---

### Task 5: 小红书配方

**Files:**
- Create: `src/main/engine/recipe.ts`（Recipe 接口）
- Create: `src/main/recipes/xiaohongshu.ts`
- Create: `tests/fixtures/xhs-search.html`, `tests/fixtures/xhs-note.html`, `tests/fixtures/xhs-note-blocked.html`
- Test: `tests/xhs.test.ts`

**Interfaces:**
- Consumes: `Session`（Task 4）、`selectItems`（Task 3）、`ScrapedItem`/`ScrapeConfig`（Task 2）。
- Produces:
  - `recipe.ts`：`interface Recipe { site: string; run(session, source, onProgress): Promise<ScrapedItem[]> }`。
  - `xiaohongshu.ts` 内导出两个**纯解析函数**（便于测试）+ 一个 Recipe 实现：
    - `parseCards(html: string): Array<Pick<ScrapedItem,'id'|'title'|'author'|'date'|'likes'|'url'|'images'>>` — 从搜索列表 HTML 解析卡片；`id` 取卡片链接中的笔记 ID（`/explore/<id>` 或 `/search_result/<id>`）；空/异常 HTML 返回 `[]`。
    - `parseNote(html: string): Pick<ScrapedItem,'title'|'author'|'date'|'text'|'images'|'videoCover'|'videoUrl'|'comments'|'blocked'>` — 命中「安全限制 / 当前笔记暂时无法浏览 / 访问链接已失效」文案时 `blocked:true`、其余空。
  - Recipe `run`：打开搜索→`waitForLogin`→滚动翻页→`parseCards`→`selectItems`→对选中项**点击卡片打开浮层**→取浮层 HTML 交 `parseNote`→`blocked` 则跳过→按 `config.contentTypes` 保留字段→Esc 关闭→节奏随机化；返回成功读到的条目。

- [ ] **Step 1: 存 fixtures**：从真实页面存三份 HTML（列表、正常笔记、被风控笔记）到 `tests/fixtures/`。
- [ ] **Step 2: 写失败测试** `tests/xhs.test.ts`：
  - `parseCards(列表)` 返回条数>0，每条有非空 `id` 与数字 `likes`；
  - `parseCards('')` 返回 `[]`；
  - `parseNote(正常)` 得到非空 `text` 且 `blocked` 非真；
  - `parseNote(被风控)` 得到 `blocked:true`。
- [ ] **Step 3:** 运行测试，Expected: FAIL。
- [ ] **Step 4:** 实现 `parseCards`/`parseNote`（用 cheerio 或 DOMParser 解析字符串），再实现 Recipe `run`（编排 Task 3/4）。
- [ ] **Step 5:** 运行测试，Expected: PASS。
- [ ] **Step 6: 手动集成验证**：对真实关键词跑一次 `run`，确认点击式打开能读到正文/图片、`blocked` 条被跳过、续抓时已抓项被去重。记录到 `tests/xhs.manual.md`。
- [ ] **Step 7: Commit** `feat: xiaohongshu recipe (parsers + click-through run)`

---

### Task 6: 通用网址配方（尽力而为）

**Files:**
- Create: `src/main/recipes/generic-url.ts`
- Test: `tests/generic-url.test.ts`, `tests/fixtures/article.html`

**Interfaces:**
- Consumes: `Session`、`ScrapedItem`。
- Produces: `extractArticle(html, url): Pick<ScrapedItem,'id'|'title'|'text'|'images'|'url'>` — 通用正文抽取（标题取 `<title>`/`og:title`，正文取最大文本密度容器，图片取 `<article>`/正文内 `<img>`）；Recipe `run` 打开固定 URL、必要时 `waitForLogin`、取页面 HTML 交 `extractArticle`。`id` 取规范化后的 URL。

- [ ] **Step 1: 写失败测试** `tests/generic-url.test.ts`：`extractArticle(fixture)` 返回非空 `title` 与 `text`，`images` 为数组。
- [ ] **Step 2:** 运行测试，Expected: FAIL。
- [ ] **Step 3:** 实现 `extractArticle` 与 Recipe `run`。
- [ ] **Step 4:** 运行测试，Expected: PASS。
- [ ] **Step 5: Commit** `feat: generic-url recipe (best-effort article extraction)`

---

### Task 7: 媒体缓存

**Files:**
- Create: `src/main/media/cache.ts`
- Test: `tests/media.test.ts`

**Interfaces:**
- Produces: `cacheMedia(urls: string[], destDir: string, fetchFn?): Promise<string[]>` — 下载每个 URL 到 `destDir`（文件名取 URL hash + 扩展名），返回本地路径；下载失败的 URL 跳过并保留原 URL。`fetchFn` 可注入以便测试。

- [ ] **Step 1: 写失败测试** `tests/media.test.ts`：注入假 `fetchFn`，两个 URL 其一成功其一抛错 → 返回数组含一个本地路径与一个原 URL；文件确实落盘。
- [ ] **Step 2:** 运行测试，Expected: FAIL。
- [ ] **Step 3:** 实现 `cacheMedia`。
- [ ] **Step 4:** 运行测试，Expected: PASS。
- [ ] **Step 5: Commit** `feat: media cache`

---

### Task 8: 报告生成

**Files:**
- Create: `src/main/report/build.ts`
- Test: `tests/report.test.ts`

**Interfaces:**
- Consumes: `ScrapedItem`（Task 2）。
- Produces:
  - `buildReport(items: ScrapedItem[], meta: { project: string; generatedAt: string; summary?: string }): { html: string; markdown: string }` — 生成自包含 HTML（图片用本地文件路径引用）与 Markdown；`summary` 存在时置于报告顶部"AI 综述"区；**summary 缺失也要能生成完整图文报告**。
  - `exportMarkdownPackage(report, items, destDir): Promise<string>` — 导出 Markdown + 图片文件夹，供粘进外部 AI（模式①）。

- [ ] **Step 1: 写失败测试** `tests/report.test.ts`：
  - 给 2 条 items、无 summary → `html` 含两条标题与 `<img`，不含"AI 综述"字样；
  - 带 summary → `html` 含该 summary 文本；
  - `exportMarkdownPackage` 在 destDir 产出 `.md` 文件与图片目录。
- [ ] **Step 2:** 运行测试，Expected: FAIL。
- [ ] **Step 3:** 实现两个函数。
- [ ] **Step 4:** 运行测试，Expected: PASS。
- [ ] **Step 5: Commit** `feat: visual report builder + markdown export`

---

### Task 9: AI 汇总（两模式 + 可切换模型 + 密钥）

**Files:**
- Create: `src/main/ai/provider.ts`, `src/main/ai/keychain.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `ScrapedItem`、Task 8 的报告。
- Produces:
  - `provider.ts`：`summarize(items, opts: { model: string; apiKey: string; requirement: string }, httpFn?): Promise<string>` — 按 `model` 路由到对应 provider（Claude/OpenAI），多模态模型附图；失败时抛带可读信息的错误（见 Review Focus：失败不得影响已生成报告）。`httpFn` 可注入测试。
  - `mergeSummaryIntoReport(report, summary)`（薄封装 Task 8）。
  - `keychain.ts`：`saveKey(provider, key)` / `loadKey(provider)`，用 Electron `safeStorage` 加密存盘。
- Produces（模式①）：复用 Task 8 的 `exportMarkdownPackage`，并提供 `importSummary(summary: string)` 把用户粘回的外部 AI 综述并入报告。

- [ ] **Step 1: 写失败测试** `tests/ai.test.ts`：
  - 注入假 `httpFn` 返回固定文本 → `summarize` 返回该文本；
  - `httpFn` 抛错 → `summarize` 抛出含错误信息的异常（调用方据此保留原报告）；
  - `model='claude-...'` 与 `model='gpt-...'` 分别命中不同 provider 分支（断言请求 URL/字段）。
- [ ] **Step 2:** 运行测试，Expected: FAIL。
- [ ] **Step 3:** 实现 provider 路由、keychain、merge/import。
- [ ] **Step 4:** 运行测试，Expected: PASS。
- [ ] **Step 5: Commit** `feat: ai summarize (switchable models) + keychain + export/import`

---

### Task 10: IPC 桥与 preload

**Files:**
- Modify: `src/main/index.ts`, `src/preload/index.ts`
- Create: `src/main/ipc.ts`, `src/shared/api.ts`
- Test: `tests/ipc-contract.test.ts`

**Interfaces:**
- Consumes: Task 2/5/6/8/9 的模块。
- Produces: `src/shared/api.ts` 定义 renderer 可调的 API 契约（类型）：`listProjects/upsertProject/...`（CRUD）、`listIdentities/createIdentity`、`runSource(sourceId, onProgress)`、`buildReportFor(projectRunResult)`、`summarize(...)`、`saveKey/loadKey`、`exportReport(...)`。main 侧 `ipc.ts` 用 `ipcMain.handle` 实装；preload 用 `contextBridge` 暴露同名方法。

- [ ] **Step 1: 写失败测试** `tests/ipc-contract.test.ts`：对 `api.ts` 导出的方法名集合与 `ipc.ts` 注册的 handler 名集合做一致性断言（防止两边漂移）。
- [ ] **Step 2:** 运行测试，Expected: FAIL。
- [ ] **Step 3:** 实现 `ipc.ts`、preload 暴露、`api.ts` 契约；`runSource` 按 site 选 Recipe，**串行**执行，经 `onProgress` 回传进度。`runSource` 在 Recipe 返回后调用 `cacheMedia`（Task 7）把图片下载到本地、把 `ScrapedItem.images` 换成本地路径，再交报告生成。
- [ ] **Step 4:** 运行测试，Expected: PASS。
- [ ] **Step 5: Commit** `feat: typed ipc bridge`

---

### Task 11: UI — 项目/信息源/身份管理

**Files:**
- Create: `src/renderer/pages/Projects.tsx`, `src/renderer/pages/SourceEditor.tsx`, `src/renderer/pages/Identities.tsx`
- Modify: `src/renderer/App.tsx`（路由）
- Test: `tests/ui-source-form.test.tsx`

**Interfaces:**
- Consumes: preload API（Task 10）。
- Produces: 分组列表与新建；分组内信息源的勾选与增删；SourceEditor 表单覆盖 `ScrapeConfig` 全部字段（类型、站点、关键词/URL、身份、条数、内容类型多选、评论开关默认关、排序、时间范围）；身份管理（新建身份 = 指定站点+标签，首次运行时手动登录）。

- [ ] **Step 1: 写失败测试** `tests/ui-source-form.test.tsx`（React Testing Library）：渲染 SourceEditor，默认 `includeComments` 未勾选；填写并提交后，传给 `upsertSource` 的对象字段与输入一致。
- [ ] **Step 2:** 运行测试，Expected: FAIL。
- [ ] **Step 3:** 实现三个页面与路由（用假/注入的 API 以便测试）。
- [ ] **Step 4:** 运行测试，Expected: PASS。
- [ ] **Step 5: 手动验证**：建分组→加小红书搜索源→设配置→保存→重开应用仍在。记录到 `tests/ui.manual.md`。
- [ ] **Step 6: Commit** `feat: projects/sources/identities UI`

---

### Task 12: UI — 运行 / 报告 / 设置

**Files:**
- Create: `src/renderer/pages/RunView.tsx`, `src/renderer/pages/ReportView.tsx`, `src/renderer/pages/Settings.tsx`
- Test: `tests/ui-settings.test.tsx`

**Interfaces:**
- Consumes: preload API（Task 10）。
- Produces: RunView 勾选源→运行→显示进度与浏览器已弹出的提示（提醒手动登录/过验证码）；ReportView 展示图文报告、提供「导出 Markdown 包」「粘回 AI 综述」入口（模式①）与「用 API 生成综述」按钮（模式②）；Settings 配置 AI 模式、模型选择、API key（存 keychain）。

- [ ] **Step 1: 写失败测试** `tests/ui-settings.test.tsx`：切到 API 模式、选模型、填 key 并保存 → 调用 `saveKey` 参数正确；切到导出模式时隐藏 key 输入。
- [ ] **Step 2:** 运行测试，Expected: FAIL。
- [ ] **Step 3:** 实现三个页面。
- [ ] **Step 4:** 运行测试，Expected: PASS。
- [ ] **Step 5: Commit** `feat: run/report/settings UI`

---

### Task 13: 端到端串联与验收

**Files:**
- Create: `tests/e2e.acceptance.md`
- Modify: 按联调需要微调各模块接线

**Interfaces:**
- Consumes: 全部任务。

- [ ] **Step 1:** 写 `tests/e2e.acceptance.md` 验收清单：
  - 建「时尚资讯」分组 + 小红书搜索源（按点赞、近 N 天、要图片+正文、不要评论）；
  - 运行→手动登录→自动抓取→生成图文报告（含图片、不含评论）；
  - 模式②：填 key→生成 AI 综述并入报告顶部；
  - 模式①：导出 Markdown 包→（模拟）粘回综述→并入报告；
  - 对同一源「再抓一轮」→报告只含新内容（去重生效）；
  - 关闭重开应用→分组/源/身份仍在。
- [ ] **Step 2:** 按清单手动跑一遍，逐条勾选；修接线 bug。
- [ ] **Step 3: Commit** `test: e2e acceptance checklist green`

---

## 后续计划（不在本 v1 内）
- 微信公众号专用配方（需各自先做小 spike 验证可行性）。
- 商用层：账号+订阅授权校验、配方服务器下发、Windows 版、客服。
