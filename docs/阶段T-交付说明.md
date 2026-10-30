# 阶段 T · 开源转型包 · 交付说明

> 交付日期：2026-10-30 · 提交 1809420 · 依据：立项书 v2.0（AGPL-3.0 开源转型）
> 范围：阶段 T 五项全部落地；阶段 M2′（发布）受门禁约束未启动（见 §5）。

## 1. 交付清单（对照创始人五项指令）

| # | 指令 | 落地 | 关键文件 / 验证 |
|---|------|------|------|
| ① | AGPL-3.0 License 全文 | ✅ | `LICENSE`（34,523 字节，取自 gnu.org 官方文本，首尾与条款已校验）；`package.json` `"license": "AGPL-3.0-only"` |
| ② | 本地免登录模式 | ✅ | `GAMESCOPE_LOCAL_MODE`（默认开启，`off` 显式关闭）；`src/lib/auth.ts`：`isLocalMode()` + `ensureLocalSession()`（懒创建唯一本地用户 local@gamescope.local + 项目，复用 users/projects 表，隔离语义一致）；**在线模式认证代码全部保留**（register/login/logout/scrypt/会话）；单测：默认开/off 分支、幂等性 |
| ③ | 首次向导/设置页 | ✅ | 页面「⚙ LLM Provider 设置（BYOK）」：预设四档（智谱含免费模型 / DeepSeek / Kimi / **Ollama 本机零成本**）+ 手填；存本机 `data/settings.json`（已 gitignore，明文存储已披露）；`GET/POST /api/settings`（Key 只回传脱敏掩码；留空=保留）；`POST /api/settings/test` 连接测试；无 Key：看板全功能、问数走既有降级路径（实测）；在线模式设置接口 403、ask 不读该文件 |
| ④ | Dockerfile + README | ✅ | 多阶段 `Dockerfile`（node:24-slim；`docker build -t gamescope .` + `docker run -p 3100:3100 -v gamescope-data:/app/data gamescope` 两行内启动，数据卷持久化）；`.dockerignore`；README 重写：一段话定位、快速开始（Node/Docker 双路径）、**BYOK 配置表**（免费模型与 Ollama 零成本明确标注）、AGPL 说明（网络服务开源义务/数据归属/贡献许可）、英文摘要段 |
| ⑤ | 测试与 tsc 纪律 | ✅ | **101/101**（新增 8 项：本地模式分支/幂等、设置读写/脱敏/优先级、Provider 工厂）、`tsc --noEmit` 零错误；M0/M1 全部既有测试未改动 |

另：演示数据入口保留（一键载入按钮与 `/api/data/demo` 不变）；页面徽标更新为开源语境。

## 2. 实机验证（curl，服务运行中）

- 无 Cookie 访问 `/api/overview` → **200**（免登录生效）；
- `/api/auth/me` → `mode:"local"`，本地用户与项目懒创建成功；
- `POST /api/data/demo` 无需登录 → 200；
- `POST /api/settings` 假 Key → `apiKeyMasked:"sk-f****7890"`（GET/POST 均不回传完整 Key）；
- `POST /api/settings/test`（假 Key）→ 可读报错 `HTTP 401（…）`；
- 空 Key 再保存 → Key 保留、模型更新成功；
- `git check-ignore data/settings.json` → 命中（不会误提交）；
- 无 Key 提问 → 降级提示含「请在页面『设置』中配置」。

## 3. 设计说明（执行方裁量，均已文档化）

1. **配置优先级**：本地模式 = `data/settings.json` > 环境变量 > 内置默认；在线模式 = 仅环境变量（多用户服务器不读任何用户的落盘配置，为 M2′ 会话级 BYOK 留位）。
2. **本地用户实现**：复用既有 users/projects 表而非旁路——避免两套数据模型，在线转本地、本地转在线的数据迁移语义一致。
3. **GlmProvider 兼任 OpenAI 兼容实现**：`baseUrl` 可指向 DeepSeek/Kimi/Ollama/LM Studio 等，无需第二套 Provider 代码（`provider: "openai-compat"` 与 `"glm"` 同走该实现）。
4. **截图/GIF**：README 占位说明（浏览器面板本机不可用）；正式截图/演示 GIF 归入 M2′ 发布物料（与指令一致）。

## 4. 测试与质量

- 测试 93 → **101**（新增：本地模式 2、设置层 5、Provider 工厂 1）；`tsc --noEmit` 零错误；
- 全部 M0/M1 既有测试保留未动（回归纪律）；
- **独立审阅**（docs/阶段T-审阅报告.md，结论：修 1 条 blocking 后可交付）：B1 = package.json 重写时 `@types/better-sqlite3` 误写为不存在的 ^1.7.0（干净环境 npm ci 必失败）→ 已恢复 ^9.6.0 并用 `npm view` + `npm install --dry-run` 验证；Docker run 阶段漏拷 next.config.ts → 已补；README 测试数 93→101 → 已同步；getProvider 无参默认改为仅环境变量（服务器安全默认）→ 已改；设置增加清除路径（DELETE /api/settings + UI 按钮）→ 已加。

## 5. 门禁与 M2′ 状态

- **门禁**：GLM 真题评测 ≥24/30 且陷阱零编造——**脚本就绪**（`scripts/ask-eval.mjs`，mock 路径已验证 30/30 接线正确）；**阻塞项：需配置 `GAMESCOPE_GLM_API_KEY`**（本机网络可达 open.bigmodel.cn）。评测可与 M2′ 准备并行，门禁通过前不发布。
- **M2′ 未启动项**：GitHub 公开仓库（semver/CHANGELOG/Issue 模板）、在线 BYOK 试用站（匿名自动会话、会话级存储+TTL、Key 内存单次转发、IP 限速、敏感数据提示）、发布物料（README 打磨+GIF、社区发布帖）、反馈闭环（weekly triage）。
