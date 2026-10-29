# GameScope

**独立游戏开发者数据分析助手** —— 接入 Steam 数据后，用可信的指标口径看懂你的游戏生意。
每个结论附带口径说明与教学卡片，让不懂商业数据分析的开发者也能看懂自己的游戏生意。

> 当前阶段：**M0（骨架）** —— 项目脚手架 + Steamworks CSV 解析器 + 3 个指标模板端到端演示。
> 立项书见 [docs/GameScope-项目立项书-v1.0.md](docs/GameScope-项目立项书-v1.0.md)。

## 快速开始

```bash
npm install        # 安装依赖（Node 20+，本项目在 Node 24 开发验证）
npm run dev        # 启动开发服务器 → http://localhost:3100
npm test           # 运行单元测试（vitest，37 项）
npm run fixtures   # 重新生成演示数据与脏数据样例（确定性种子）
```

打开 http://localhost:3100，点击「一键载入演示数据」即可体验完整流程；
也可以上传自己的 Steamworks 导出 CSV（支持愿望单 / 流量与转化 / 销售报告，自动识别类型）。

## M0 范围

| 模块 | 说明 |
|------|------|
| CSV 解析器 | BOM/UTF-16 编码嗅探、文件类型自动识别（别名表驱动）、行级校验、可读报错（指明列与行） |
| 指标模板 ×3 | 愿望单积累速率（周净增 + 脉冲检测）、页面转化率（5–12% 经验区间）、退款率（<10% 正常 / >15% 警示） |
| 信任机制（D4） | 每个结果展示：定义、公式、参与字段、行数、时间范围、数据来源文件 |
| 教学卡片（D7） | 是什么 / 为什么这么算 / 健康区间 / 下一步问什么（每张 ≤120 字） |
| 基础校验层（F5 预演） | 重复日期、日期缺口、空值占比、愿望单总量与净增一致性 → 显著警告而非静默输出 |
| 存储 | 本地 SQLite（`data/gamescope.db`，better-sqlite3），单游戏单用户（D5） |

M1 预告：AI 自然语言问数（LLM 可切换，禁止 LLM 算数）、其余 9–12 个指标模板、账号体系、Steam Web API 接入。

## 目录结构

```
src/
  app/                 # Next.js App Router（页面 + API 路由）
    api/data/          #   upload / demo / reset
    api/overview/      #   数据集 + 指标计算结果
  components/          # UI 组件（ECharts 图表、口径面板、教学卡片）
  lib/
    csv/               # 解码 → 解析 → 类型识别 → 映射 → 校验 → 入库
    db/store.ts        # SQLite 存储层
    metrics/           # 指标模板（纯函数，单元测试覆盖）
    sanity/check.ts    # 数据质量校验
    llm/provider.ts    # M1 LLM 可切换接口预留
scripts/generate-fixtures.mjs   # 演示数据生成器（虚构游戏《星尘旅人》）
fixtures/              # 测试 CSV（含 dirty/ 脏数据样例）
tests/                 # vitest 单元测试（手工计算基准）
docs/                  # 立项书、Steamworks CSV 格式调研、M0 演示指南
```

## 技术栈

与立项书第 9 节建议一致，无偏离：
Next.js 15（App Router）· React 19 · Tailwind CSS 4 · ECharts 5 · SQLite（better-sqlite3）· papaparse · vitest · TypeScript。

## 数据与合规

- 只处理用户自愿上传的 CSV；数据仅存本地，不做任何上传/同步。
- 所有「健康区间 / 经验区间」均为独立游戏发行社区经验值，非 Valve 官方标准。
- 演示数据为虚构游戏《星尘旅人》，由固定种子生成器产生，可复现。
- Steamworks CSV 格式依据见 [docs/steamworks-csv-formats.md](docs/steamworks-csv-formats.md)。
