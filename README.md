# GameScope

**独立游戏开发者的 Steam 数据分析助手**——上传 Steamworks 导出的 CSV（愿望单、流量与转化、销售、地区），得到 12 个内嵌发行经验口径的指标模板：每个结果都附带**完整口径链路（公式、参与行数、时间范围）与教学卡片**，并用 AI 问数（LLM 只解析意图，计算全部在本地代码执行，绝不编造数值）。

GameScope 是开源软件（AGPL-3.0），BYOK（Bring Your Own Key）：模板看板**完全免费、完全本地**，AI 问数接入你自己的任意 OpenAI 兼容端点（含本机 Ollama 零成本方案）。

> **Screenshot / GIF**：将随发布物料提供（docs/screenshots/）；在本地 `npm run dev` 打开即可看到完整界面。

---

## 为什么是 GameScope

通用 BI 假设你会建模，Steam 后台只给你原始数字。GameScope 把独立游戏发行社区的经验口径（愿望单积累、页面转化 5–12%、退款率 <10% 正常/>15% 警示、Boxleiter 估算等，均标注为经验值而非官方标准）固化成 12 个模板，发售前看愿望单健康、发售期看首周表现、长线看折扣脉冲与市场结构——并坚持「口径透明 + 代码算数 + 异常警告」的信任三件套。

## 快速开始

```bash
# 方式一：Node.js（Node 20+）
npm install
npm run dev          # → http://localhost:3100（本地模式，免登录）
npm test             # 93 项测试

# 方式二：Docker（数据持久化在卷里）
docker build -t gamescope .
docker run -p 3100:3100 -v gamescope-data:/app/data gamescope
```

打开 http://localhost:3100 → 点「一键载入演示数据」体验完整流程（虚构游戏《星尘旅人》全周期数据）；随后可上传你自己的 Steamworks 导出 CSV（自动识别类型）。

### 启用 AI 问数（BYOK，可选）

页面「⚙ LLM Provider 设置」中选择预设或手填，保存并测试连接即可；不配置时模板看板全功能可用，问数自动降级为看板引导。

| Provider | baseUrl | 模型示例 | 成本 | 备注 |
|---|---|---|---|---|
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | `glm-4-flash` | 有免费额度 | 国内直连，注册即送额度 |
| DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-chat` | 极低 | OpenAI 兼容 |
| Moonshot Kimi | `https://api.moonshot.cn/v1/chat/completions` | `moonshot-v1-8k` | 低 | OpenAI 兼容 |
| **Ollama（本机）** | `http://localhost:11434/v1/chat/completions` | `qwen2.5:7b` 等任意已拉取模型 | **零成本、零出网** | `ollama pull qwen2.5:7b` 后即用 |
| 任意 OpenAI 兼容端点 | 自填 | 自填 | — | LM Studio / vLLM / OpenRouter 均可 |

- Key 明文存于本机 `data/settings.json`（已 gitignore），不上传、不遥测；
- 也可用环境变量：`GAMESCOPE_GLM_API_KEY` / `GAMESCOPE_GLM_BASE_URL` / `GAMESCOPE_GLM_MODEL`（详见 [docs/llm-providers.md](docs/llm-providers.md)）；
- LLM 只负责把问题解析为意图 JSON（指标 + 时间范围），计算一律在本地模板代码执行；解析失败自动降级到模板看板。

## 指标模板（12 个，欢迎贡献）

**发售前**：愿望单积累速率（周净增 + 脉冲识别）· 愿望单删单率（>8% 预警线）· 愿望单/页面访问转化（3–10%）
**发售期**：愿望单→首周销量转化（10–20%）· 首周销量占比 · 页面转化率（5–12%）· 退款率（<10% 正常 / >15% 警示）
**长线运营**：折扣愿望单脉冲系数（5–20 倍带）· 评论销量估算（Boxleiter ×25–70，区间展示）· 好评率分档 · 流量来源结构 · 地区销售结构

每个模板五要素：定义 / 计算口径（精确到字段与公式）/ 健康区间（社区经验值，非 Valve 官方标准）/ 推荐图表 / 教学卡片。

## 支持的数据

| 数据 | 获取方式 | 状态 |
|---|---|---|
| Steamworks 愿望单报告 CSV | 后台手动导出上传 | ✅ |
| Steamworks 流量与转化 CSV | 后台手动导出上传 | ✅ |
| Steamworks 销售 / 地区销售 CSV | 后台手动导出上传 | ✅（测试数据为构造格式，真实导出回归进行中） |
| Steam 公开评论与价格 | 输入 App ID 拉取（官方只读接口） | ✅ |
| CCU 峰值 | — | 已裁掉 |

数据仅存本地 SQLite（`data/gamescope.db`）；演示数据为内置的虚构游戏全周期数据。

## AGPL-3.0 说明

本项目以 [GNU AGPL-3.0](LICENSE) 发布。要点（非法律建议）：

- 你可以自由使用、修改、再分发本项目，包括商业用途；
- 如果你修改了代码并把它作为网络服务提供给他人，AGPL 要求你同样以 AGPL 开放修改后版本的源码（这是 AGPL 与 GPL 的关键差异）；
- 你自己的游戏数据、你上传的 CSV、你配置的 API Key 都属于你，与本项目代码无关；
- 贡献回主仓库的代码默认以同一许可证发布。

## 给开发者

```bash
npm test        # 93 项（vitest）：模板手工计算基准、解析器、AI 问数管道与陷阱拒答
npm run fixtures  # 重新生成演示数据（确定性种子）
npx tsc --noEmit  # 类型检查
```

```
src/lib/csv/       Steamworks CSV 解析（编码/类型识别/行级校验/可读报错）
src/lib/metrics/   12 个指标模板（纯函数 + METRIC_REGISTRY，看板与问数同源）
src/lib/ask/       AI 问数管道（意图白名单校验 → 复用模板计算 → 失败降级）
src/lib/llm/       Provider 抽象（GLM/OpenAI 兼容/mock，BYOK 配置）
src/lib/db/        SQLite 存储（本地单用户 / 在线多用户两种模式）
docs/              立项书、数据格式调研、M0/M1 演示指南与审阅报告、LLM 接入文档
```

### English (short)

GameScope is a local-first analytics companion for indie game developers: upload your Steamworks CSV exports (wishlists, traffic & conversion, sales, regional), get 12 metric templates with transparent calibers, health ranges and teaching cards, and ask questions in natural language — the LLM only parses intent, all math runs in local code. Free and local (template dashboard needs no API key); AI features are BYOK via any OpenAI-compatible endpoint, including zero-cost local Ollama. Licensed under AGPL-3.0. Quick start: `npm install && npm run dev` → http://localhost:3100.

---

## 文档

- [docs/steamworks-csv-formats.md](docs/steamworks-csv-formats.md) — Steamworks 导出格式调研（含来源与未核实项）
- [docs/llm-providers.md](docs/llm-providers.md) — Provider 接入与切换
- [docs/M1-终验-演示指南.md](docs/M1-终验-演示指南.md) — 全功能演示与 F1–F6 验收对照
- [docs/GameScope-项目立项书-v1.0.md](docs/GameScope-项目立项书-v1.0.md) — 项目立项书
