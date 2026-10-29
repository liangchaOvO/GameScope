"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OverviewDTO } from "../lib/api-types";
import { KIND_LABELS } from "../lib/types";
import { GROUP_LABELS, type MetricGroup } from "../lib/metrics/types";
import type { AskOutcome } from "../lib/ask/pipeline";
import UploadPanel from "../components/UploadPanel";
import MetricCard from "../components/MetricCard";
import MetricChart from "../components/MetricChart";
import AskResult from "../components/AskResult";
import { WarningList } from "../components/InfoPanels";

const GROUP_ORDER: MetricGroup[] = ["prelaunch", "launch", "liveops"];

export default function Home() {
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewDTO | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appIdInput, setAppIdInput] = useState("");
  const [steamMsg, setSteamMsg] = useState<string | null>(null);
  const [steamBusy, setSteamBusy] = useState(false);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/overview", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error(`加载失败（${res.status}）`);
      setOverview((await res.json()) as OverviewDTO);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setAuthChecked(true);
    }
  }, [router]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  async function handleSteamRefresh() {
    setSteamBusy(true);
    setSteamMsg(null);
    try {
      const res = await fetch("/api/steam/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: Number(appIdInput) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `请求失败（${res.status}）`);
      setSteamMsg(
        `已拉取：《${json.price?.name ?? "未知"}》· 好评率快照与价格已更新（${new Date().toLocaleString("zh-CN")}）。`
      );
      await fetchOverview();
    } catch (e) {
      setSteamMsg(e instanceof Error ? e.message : "拉取失败");
    } finally {
      setSteamBusy(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const [askQuestion, setAskQuestion] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askOutcome, setAskOutcome] = useState<AskOutcome | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  async function handleAsk() {
    if (!askQuestion.trim()) return;
    setAskBusy(true);
    setAskError(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: askQuestion }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `请求失败（${res.status}）`);
      setAskOutcome(json as AskOutcome);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "提问失败");
    } finally {
      setAskBusy(false);
    }
  }

  if (!authChecked) {
    return <main className="mx-auto max-w-5xl px-6 py-10 text-sm text-gray-500">加载中…</main>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold tracking-tight">GameScope</h1>
            <span className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600">
              M1 中期检查点 · 12 模板全量
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{overview?.user.email}</span>
            <button onClick={handleLogout} className="text-gray-500 underline hover:text-gray-700">
              退出登录
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          上传 Steamworks 导出的 CSV（自动识别类型）+ 输入 App ID 拉取公开评论/价格，查看 12 个指标模板。
          AI 自然语言问数（F3）将在中期检查通过后交付。
        </p>
      </header>

      <section className="space-y-4" aria-label="Steam 数据接入">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-gray-800">Steam 公开数据</span>
            <input
              type="number"
              min={1}
              placeholder="输入 App ID（商店页 URL 中的数字）"
              value={appIdInput}
              onChange={(e) => setAppIdInput(e.target.value)}
              className="w-64 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
            />
            <button
              onClick={handleSteamRefresh}
              disabled={steamBusy || !appIdInput}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
            >
              {steamBusy ? "拉取中（≥3s/请求）…" : "拉取评论与价格"}
            </button>
            {overview?.project.appId != null && (
              <span className="text-xs text-gray-400">当前 App ID：{overview.project.appId}</span>
            )}
          </div>
          {steamMsg && <p className="mt-2 text-sm text-gray-700">{steamMsg}</p>}
          <p className="mt-1 text-xs text-gray-400">
            只读官方接口，限速 ≥3 秒/请求；评论/价格以快照形式存储，可随时刷新。
          </p>
        </div>
      </section>

      <section className="space-y-4" aria-label="AI 问数">
        <h2 className="text-base font-semibold text-gray-800">AI 问数（F3）</h2>
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAsk();
              }}
              maxLength={200}
              placeholder="例：最近愿望单涨得怎么样？/ 退款率正常吗？/ 哪些国家买得多？"
              className="min-w-[16rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
            <button
              onClick={handleAsk}
              disabled={askBusy}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
            >
              {askBusy ? "解析中…" : "问一问"}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            LLM 只负责把问题解析为意图（指标 + 时间范围），全部计算在本地模板代码中执行；
            解析失败或超出数据范围时自动降级到下方模板看板，绝不生成数值。
          </p>
          {askError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{askError}</p>
          )}
          {askOutcome && <AskResult outcome={askOutcome} />}
        </div>
      </section>

      <section className="space-y-4" aria-label="数据接入">
        <h2 className="text-base font-semibold text-gray-800">① 数据接入</h2>
        <UploadPanel onRefresh={fetchOverview} />
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {overview && overview.datasets.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700">
              已接入数据（{overview.datasets.length} 份，重复上传同类报告会替换该账号下的旧数据）
            </h3>
            <ul className="space-y-2">
              {overview.datasets.map((d) => (
                <li key={d.kind} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">{KIND_LABELS[d.kind]}</span>
                    <span className="text-gray-500">{d.filename}</span>
                    <span className="tabular-nums text-gray-600">
                      {d.rowCount} 行 · {d.dateMin} ~ {d.dateMax}
                    </span>
                    {d.warnings.length > 0 && (
                      <span className="text-amber-700">⚠ {d.warnings.length} 项数据质量提示</span>
                    )}
                  </div>
                  {d.warnings.length > 0 && (
                    <div className="mt-2">
                      <WarningList warnings={d.warnings} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-4" aria-label="指标看板">
        <h2 className="text-base font-semibold text-gray-800">② 指标看板（12 个模板）</h2>
        {!overview ? (
          <p className="text-sm text-gray-500">加载中…</p>
        ) : !overview.hasData ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center text-gray-500">
            还没有数据。上传 Steamworks 导出的 CSV，或点击上方「一键载入演示数据」体验完整流程。
          </div>
        ) : (
          GROUP_ORDER.map((group) => {
            const metrics = overview.metrics.filter((m) => m.group === group);
            if (metrics.length === 0) return null;
            return (
              <div key={group} className="space-y-4">
                <h3 className="border-l-4 border-gray-300 pl-2 text-sm font-semibold text-gray-600">
                  {GROUP_LABELS[group]}
                </h3>
                <div className="space-y-6">
                  {metrics.map((m) => (
                    <MetricCard key={m.id} metric={m} chart={<MetricChart metric={m} />} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      <footer className="space-y-1 border-t border-gray-200 pt-4 text-xs leading-relaxed text-gray-500">
        <p>
          所有「健康区间 / 经验区间」均为独立游戏发行社区流传的经验值（GDC 演讲、发行商公开分享、行业媒体），
          非 Valve 官方标准，仅供参考。数据按账号隔离，每账号 1 个游戏项目。
        </p>
        <p>
          M1 中期范围：F1 数据接入（含 Steam Web API）+ F2 全量模板 + F5 校验层 + F6 账号体系。
          演示数据为虚构游戏《星尘旅人》（含虚构评分快照）。
        </p>
      </footer>
    </main>
  );
}
