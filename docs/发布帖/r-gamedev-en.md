# 发布帖备稿 · r/gamedev（英文）

> 标题：I open-sourced my Steam analytics tool for indie devs — upload your Steamworks CSVs, get 12 metrics with transparent calibers (AGPL, local-first, BYOK)

---

Hi r/gamedev! I'm an indie dev who got tired of two things: Steamworks gives me raw numbers but no context, and generic BI tools assume I know how to model data. So I built **GameScope** and I'm releasing it under AGPL-3.0.

**What it does (local-first, free):**

- Upload the CSVs you can already export from Steamworks (wishlists, traffic & conversion, sales, regional sales) — it auto-detects the format and validates every row.
- Get **12 metric templates** built around indie publishing community wisdom: wishlist accumulation (weekly net + event-pulse detection), deletion rate (>8% warning), wishlist→visit conversion (3–10%), wishlist→first-week sales (10–20%), first-week share, page conversion (5–12%), refund rate (<10% ok / >15% alert), discount pulse coefficient, Boxleiter estimate, review score tier, traffic source mix, regional mix.
- Every result shows its **full caliber**: the exact formula, how many rows and which date range participated, and a "teaching card" (what it is / why it's computed this way / healthy range / what to ask next). Health ranges are community rules of thumb, clearly labeled — no fake official benchmarks.
- **AI Q&A (BYOK, optional):** ask "why did my wishlists dip?" — the LLM only parses intent (metric + time range); all math runs in local template code, so it can't hallucinate numbers. If intent parsing fails it falls back to the dashboard. Works with any OpenAI-compatible endpoint, including **free tiers and a zero-cost local Ollama setup**. The template dashboard works with **no API key at all**.

**Privacy:** everything runs locally — SQLite file on your machine, no telemetry, your API key stays in a local config file (or in-memory if you use the hosted trial). Commercially sensitive data? Run it locally.

**Get it:** GitHub repo (AGPL-3.0): <你的仓库地址> — `npm install && npm run dev`, or Docker. A built-in fictional demo dataset lets you try the full flow in 30 seconds.

**What I want from you:** feedback on the metric calibers (especially refund rate and the discount pulse heuristic), bug reports, and metric template contributions — there's an issue template for proposing a new metric with its source.

Known limitations: real-export column regression is ongoing (built from official docs + community documentation; the parser is alias-driven so fixes are one line each). No predictions, no competitor benchmarks (out of scope by design).

---

*（发布时间建议：避开周末；附 30 秒 GIF；在首评补充架构与技术栈说明，减少主贴长度）*
