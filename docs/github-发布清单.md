# GitHub 发布清单（创始人操作，预计 30 分钟）

> 前提：门禁已通过（GLM-5.3-Flash @ scnet.cn，29/30、陷阱 10/10，归档于 docs/ask-eval-results.json）。

## 1. 建仓库与推送

1. GitHub 创建**公开**仓库 `Gamescope`（不要勾选自动初始化 README）；
2. 本地：
   ```powershell
   git remote add origin git@github.com:<你的用户名>/Gamescope.git
   git push -u origin master
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. 仓库 Settings → 默认分支确认 `master`（或改 `main` 后同步 CI 分支名）。

## 2. 仓库设置

- About 栏：一句话定位 + topics（`indie-game` `steam` `analytics` `nextjs` `byok` `agpl`）；
- Features：勾选 Issues、Discussions（模板 config.yml 已指向 Discussions）；
- 分支保护（可选）：main 禁止 force push；
- 确认 LICENSE 显示为 AGPL-3.0。

## 3. 占位符替换（发布前必做）

- `.github/ISSUE_TEMPLATE/config.yml` 与 `docs/发布帖/*.md` 中的 `OWNER` / `<你的仓库地址>`；
- `docs/screenshots/`：补 2–3 张界面截图与 1 个 30 秒 GIF（README 已留占位说明）；
- CI 首次运行应为绿（node 24 + npm ci + test + tsc）。

## 4. 发布

1. GitHub Releases → Draft new release → tag `v0.2.0` → 粘贴 CHANGELOG 对应段 → Publish；
2. 发布帖：按 `docs/发布帖/` 备稿顺序发（r/gamedev 与 indienova/v2ex 错开 1–2 天）；
3. 各帖发出后把链接回填到 `docs/运营/成功指标跟踪表.md` 备注。

## 5. 在线试用站（可选，与发帖解耦）

- 任意 VPS/容器平台：`GAMESCOPE_LOCAL_MODE=off` + 反向代理（HTTPS 必须，否则 Cookie/Key 暴露面不可控）；
- 环境变量：`GAMESCOPE_TRIAL_TTL_HOURS`（默认 72）；无需任何 LLM 官方 Key（用户 BYOK，内存单次转发）；
- 确认反代把 `X-Forwarded-For` 传给应用（IP 限速依赖）；
- 上线前自检清单：无 Cookie 访问自动获得匿名会话；两浏览器隔离；TTL 到期数据被清；429 限速生效；页面可见三段披露（TTL 清理 / Key 内存转发 / 商业敏感建议本地部署）。
- **务必经反向代理并传 `X-Forwarded-For`**：应用直连暴露时，所有用户共享同一个 `unknown` 限速桶（全站 20 次/小时），且 IP 限速形同虚设。

## 6. 发布后

- 按 `docs/运营/反馈闭环与triage.md` 每周一 triage；
- 按 `docs/运营/成功指标跟踪表.md` 记录 4 周指标。
