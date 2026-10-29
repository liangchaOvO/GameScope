# LLM Provider：接通与切换（F3）

> 纪律重申：LLM 在 GameScope 中**只做意图理解**（输出受白名单校验的意图 JSON：指标 id + 维度 + 时间范围），
> 全部计算在本地模板代码执行；意图解析失败自动降级到模板看板，**任何情况下不会由 LLM 生成数值**。
> 输入预算：单次问数 prompt < 5,000 tokens（`src/lib/llm/prompt.ts` 运行时守卫）。

## 主 Provider：智谱 GLM（已接通，默认）

- 端点：`https://open.bigmodel.cn/api/paas/v4/chat/completions`（OpenAI 兼容协议）
- 实现：`src/lib/llm/glm.ts`（`GlmProvider`，fetch 可注入、单测覆盖正常/401/非 JSON 路径）
- 输出解析：`extractJson` 容忍 ```json 围栏 → `validateIntent` 白名单校验（编造指标 id / 坏日期 / 越界枚举一律整体拒绝并降级）

### 启用步骤（需要可直连 open.bigmodel.cn 的网络）

1. 在智谱开放平台 (bigmodel.cn) 创建 API Key；
2. 设置环境变量后重启服务：
   - `GAMESCOPE_LLM_PROVIDER=glm`（默认值，可不设）
   - `GAMESCOPE_GLM_API_KEY=<你的 API Key>`（**必填**）
   - `GAMESCOPE_GLM_MODEL=glm-4-flash`（可选，默认 glm-4-flash；可换 glm-4-plus 等）
3. 验证：页面向数框提问 → 结果卡「意图解析」区应显示 Provider=glm 与 token 用量；
4. 真题评测：`node scripts/ask-eval.mjs` → 30 题正确率与逐题结果写入 `docs/ask-eval-results.json`。

> 当前开发环境状态（2026-10-30）：网络可达 open.bigmodel.cn，但未配置 API Key——问数会走
> 「可读报错 → 降级到模板看板」路径（该路径已实测）；配置 Key 后即为完整真题实测。
> 另实测：AutoClaw 本地 token 服务（:18432）签发的内部凭据**不适用**于开放平台接口（401），
> 产品不应复用宿主应用凭据，故以标准 API Key 为准。

## 备用 Provider 切换

### A. 切到离线 mock（关键词规则意图，用于演示/回归，非 LLM）

```powershell
$env:GAMESCOPE_LLM_PROVIDER='mock'; npm run dev
```

结果卡的「意图 Provider」会显示 `mock`，评测结果 JSON 的 providerId 同步标注。

### B. 接入其他 OpenAI 兼容服务商（如 DeepSeek / 月之暗面 / OpenAI）

无需新代码：`GlmProvider` 的端点可换。

```powershell
$env:GAMESCOPE_LLM_PROVIDER='glm'
$env:GAMESCOPE_GLM_BASE_URL='https://api.deepseek.com/chat/completions'   # OpenAI 兼容端点
$env:GAMESCOPE_GLM_API_KEY='<该服务商的 Key>'
$env:GAMESCOPE_GLM_MODEL='deepseek-chat'
npm run dev
```

### C. 接入非 OpenAI 协议的服务商（如 Anthropic）

实现 `src/lib/llm/provider.ts` 的 `LlmProvider` 接口（唯一要求：`interpretIntent(question)` 返回
可被 `validateIntent` 校验的意图 JSON 原始对象），在 `src/lib/llm/index.ts` 的 `getProvider()`
注册新 id，然后用 `GAMESCOPE_LLM_PROVIDER=<新 id>` 切换。参考实现：`glm.ts`（约 130 行）。

### 切换验收清单

1. `npm test` 全绿（Provider 无关：管道测试用注入实现）；
2. 页面提问 → 「意图解析」区显示新 providerId；
3. 断网/错 Key 状态下提问 → 必须出现降级提示，且**不出现在何指标数值**；
4. `node scripts/ask-eval.mjs` 重跑 30 题。

## Token 与成本控制

- prompt 固定组成：目录 12 条 + schema + 2 个 few-shot + 数据窗口一句话，实测估算 ≈1,100 tokens，
  上限守卫 5,000（超限直接抛错而非截断，保证行为可预期）；
- 输出 `max_tokens=300`（意图 JSON 很小）；
- 对话历史：M1 不携带（每次独立问数），从根上避免上下文膨胀——多轮对话与摘要压缩留待 M2 按
  立项书第 9 节要求实现。
