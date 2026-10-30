# 阶段 T · 开源转型包 · 独立审阅报告

- 审阅对象：提交 1809420（= 当前 HEAD，工作区干净）
- 审阅时间：2026-10-30 · 审阅方式：只读核对 + 实跑（未修改任何被审文件）
- 状态说明：为验证「留空保 Key」曾通过 API 临时创建 data/settings.json（假 Key），测毕已删除，服务恢复 configured=false 原状；未重启服务。

## 一、结论

**不能原样交付，共 1 条 blocking（正确性层）**：package.json 将 `@types/better-sqlite3` 改为不存在的版本 `^1.7.0`，任何全新 `npm install`（README 快速开始第一步）与 Dockerfile 第一阶段 `npm ci` 都必然失败（已实测 `npm ci --dry-run` 报 ETARGET）。其余核心主张——LICENSE 逐字全文、本地免登录模式、设置层脱敏与留空保 Key、Docker 多阶段结构、101/101 测试、tsc 零错误、M0/M1 回归纪律——经独立取证全部属实。修复该一条依赖声明后即可交付；5 条建议项均不阻断。

## 二、Blocking（必须修，1 条）

### B1. `@types/better-sqlite3@^1.7.0` 在 registry 不存在 → 全新安装与 Docker 构建必挂

- **位置**：package.json:25（本提交由 `^9.6.0` 改为 `^1.7.0`，git diff 285cdfd..1809420 可证）；package-lock.json:20 仍为 `^9.6.0`、节点锁定 9.6.0。
- **证据**：`npm view @types/better-sqlite3@1.7.0 version` → E404（latest 为 9.6.0）；`npm ci --dry-run` → `npm error ETARGET: No matching version found for @types/better-sqlite3@^1.7.0`，exit 1。
- **影响**：干净环境执行 README:19、README:94 的 `npm install` 直接失败；Dockerfile:6-7 的 `npm ci` 在 deps 阶段失败 → 指令④的「一行启动」与 README 快速开始双双不可用。开源发布后第一个用户即撞墙。本机 node_modules 是旧 manifest 时代安装的 9.6.0，故本地 101/101 与 tsc 通过掩盖了问题（交付说明 §1⑤「测试与 tsc 纪律」属实，但不覆盖干净安装路径）。
- **修复方向**：package.json:25 恢复 `^9.6.0`（与 lockfile、本机实际安装及 tsc 所用版本一致）；若确需变更依赖版本，必须 `npm install` 同步 lockfile 并确认 registry 存在该版本。修后复跑 `npm ci --dry-run`，并在有 docker 的环境验证 `docker build`。

## 三、建议（值得考虑，5 条）

- **C1. README 测试计数过时**：README:21、README:78 两处写「93 项」，实际 101（本提交新增 8 项；提交信息与交付说明均称 101/101）。建议改 101 或去掉具体数字。
- **C2. 截图/GIF 仍是占位承诺**：README:7 仅声明「将随发布物料提供（docs/screenshots/）」。创始人指令④明确要求 README 含「截图或 GIF」；交付说明 §3.4 已披露该裁量（浏览器面板本机不可用）。发布前需补齐，否则④只算部分落地。
- **C3. Dockerfile run 阶段未复制 next.config.ts**（Dockerfile:22-24 仅拷 .next/node_modules/package.json）：其 `serverExternalPackages:["better-sqlite3"]`（next.config.ts:1-5）是构建期配置，运行期缺失仍可启动，但未来加入运行期配置（redirects/headers 等）会静默失效。建议一并 COPY；CMD 可用 `node_modules/.bin/next start` 替代 `npx`。
- **C4. `getProvider()` 无参默认会读配置文件**：src/lib/llm/index.ts:12 写死 `effectiveSettings({ localMode: true })`，与 config.ts:7「在线模式不读配置文件」的设计自述矛盾。当前唯一服务端调用点 ask/route.ts:38 显式传参、不可触发，但这是 M2′ 在线模式的陷阱位。建议默认跟随 `isLocalMode()` 或强制显式传 settings。
- **C5. 配置无清空/重置路径**：/api/settings 只有 GET/POST（settings/route.ts:16、38），实测 `curl -X DELETE` → 405；按设计留空 Key 永远保留原值，UI 亦无重置按钮——Key 配错后无法回到「未配置」状态，只能手改 data/settings.json。审查步骤 6 预期的 DELETE 测试因此无法执行。建议补 DELETE 路由或面板重置（非指令硬性要求，故不入 blocking）。

## 四、仅记录

- Dockerfile 未设非 root USER（默认 root 运行）；run 阶段整包复制 node_modules 含 devDependencies，可用 `npm ci --omit=dev` 或 next standalone 瘦身。
- better-sqlite3 12.11.1 官方 release 含 node-v137（Node 24）的 linux-x64 / linuxmusl-x64 / arm64 预编译（GitHub assets 全量核实），node:24-slim 无工具链也可安装，兼容性论证成立；甚至可换 alpine 基础镜像。
- tests/local-mode.test.ts 的 ensureLocalSession 用例直接读写真实 data/gamescope.db（与运行中服务共用同一 SQLite，靠幂等 + WAL 兜底）；建议测试内把 DB 指向临时目录。
- 本地模式全 API 免登录且无 Origin/CSRF 校验：恶意网页可用 no-cors + text/plain 向 http://localhost:3100/api/settings 提交合法 JSON 改写 baseUrl（此后问数的指标数据将发往攻击者端点）。本地单用户工具可接受，M2′ 在线模式必须补 Origin 校验/CSRF 防护。
- README:18「Node 20+」与 Dockerfile node:24-slim 并存，均满足 Next 15 要求，不构成矛盾。
- 门禁 GLM 真题评测（≥24/30）未执行——缺 GAMESCOPE_GLM_API_KEY，交付说明 §5 已如实披露；「未过不得发布」约束未违反（M2′ 未启动）。
- maskKey 对 ≤8 位 Key 全掩码、更长 Key 露前 4 后 4（config.ts:100-104）：行业惯例，可接受。

## 五、审阅范围与未覆盖

### 已核实（全部当轮取证，非采信作者自述）

- **① License**：LICENSE 与 gnu.org/licenses/agpl-3.0.txt 的 SHA256 逐字节一致（0D96A4FF68AD…BCB0，34,523 字节、661 行，首尾条款核对一致）；package.json:6 `"license": "AGPL-3.0-only"`（SPDX 合法标识）。
- **② 本地模式**：auth.ts:26-28 默认开启（仅显式 `off` 关闭）；ensureLocalSession（auth.ts:84-96）globalThis 缓存 + getUserByEmail 复用，幂等（单测 local-mode.test.ts:44-51）；在线模式路径未破坏——getSession 读 Cookie（99-110），register/login/logout 三路由本提交零改动；settings GET/POST 在线模式 403（settings/route.ts:20-25、42-52）；ask 在线模式不读配置文件（ask/route.ts:38 → config.ts:77 仅 `localMode === true` 才 existsSync；单测 local-mode.test.ts:101-111）。
- **③ 设置层**：sanitize 坏值回退（config.ts:33-45；单测 66-72 含 `javascript:alert(1)` 用例）；留空保 Key（config.ts:64；单测 86-90；**API 实测**：存假 Key → 掩码 sk-a****7890 → 留空保存改模型 → 掩码不变、hasApiKey 仍 true）；maskKey（config.ts:100-104）；GET/POST 仅回掩码（settings/route.ts:26-33、75-84，实测响应无 Key 原文）；test 路径失败亦回 200 + 可读报错（settings/test/route.ts:17-28）；面板预设含智谱（含免费模型）/DeepSeek/Kimi/Ollama 零成本（SettingsPanel.tsx:16-43）、未配置自动展开首导向导（63）、明文存储披露（198）、在线模式不渲染（57、73）；无 Key 问数走既有降级（pipeline.ts:67-70 Provider 失败 → degrade 带引导文案）。
- **④ Dockerfile/README**：三阶段结构正确；VOLUME /app/data（Dockerfile:26）、EXPOSE 3100（25）、GAMESCOPE_LOCAL_MODE=on（20）；store.ts:107 自动 mkdirSync 建目录——Docker 空数据卷可启动；.dockerignore 排除 data/（Key 不进镜像，安全正确），排除 tests/docs/*.md 不破坏构建（grep 核实 src 无任何 tests 引用，tsconfig 无硬编码文件清单）；README 五要素四项齐：定位一段话（README:1-9）、快速开始含 Docker（17-25）、BYOK 表含智谱免费与 Ollama 零成本（32-40，四个端点 URL 与各家官方一致）、AGPL 说明（66-73）+ 英文摘要（92-94）；截图为占位（见 C2）。
- **⑤ 测试纪律**：npm test 实跑 **101/101**（steamApi14+dates6+metrics13+local-mode8+parser21+metrics-m1 22+ask17）；`npx tsc --noEmit` exit 0；git diff 285cdfd..1809420 -- tests/ 仅新增 local-mode.test.ts（121 行），M0/M1 既有测试与 vitest/tsconfig 配置零改动；新增 8 测试均为具体值断言（如 :90 `toBe("sk-keep-me")`、:106/:110 文件优先与环境变量回退）。
- **实跑 curl**（localhost:3100，未重启）：无 Cookie GET /api/overview → **200**（免登录）；GET /api/auth/me → `mode:"local"`；POST 留空 Key → Key 保留、模型更新（见③）；DELETE /api/settings → **405**（无此路由，见 C5）；`git check-ignore` data/settings.json、data/gamescope.db 均命中 .gitignore:9 `/data/`。

### 未覆盖与原因

- **docker build / docker run 未实跑**：本机未安装 docker。依赖阶段失败已由 `npm ci --dry-run` 的 ETARGET 实锤（Dockerfile:6-7 与本机输入同一对 package.json/lockfile）；修复 B1 后建议在有 docker 的环境复跑构建与容器启动。
- **在线模式（GAMESCOPE_LOCAL_MODE=off）未实机起服验证**（受「勿重启」约束）：路由级 403 与登录流依据为代码路径 + effectiveSettings 分支单测。
- **POST /api/settings/test 未对真实上游发请求**：避免消耗真实 Key 额度（当前环境本就未配置 Key）；错误路径的可读性依据代码（settings/test/route.ts:24-28）与交付说明自述。
- **门禁 30 题 GLM 评测未执行**：缺 API Key（作者已披露，属 M2′ 发布前置条件）。
- **平台脱敏说明**：auth.ts:30/49、config.ts:86、settings.json 文件内容在工具输出中被运行环境的安全脱敏器遮蔽（显示 `[redacted]`）；相应行以 tsc 全量通过 + 行为级单测 + API 实测间接核实，报告未引用任何被遮蔽的原文。