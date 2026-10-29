"use client";

import { useCallback, useEffect, useState } from "react";
import type { OverviewDTO } from "../lib/api-types";
import { KIND_LABELS } from "../lib/types";
import UploadPanel from "../components/UploadPanel";
import MetricCard from "../components/MetricCard";
import { WarningList } from "../components/InfoPanels";
import WeeklyNetChart from "../components/charts/WeeklyNetChart";
import ConversionChart from "../components/charts/ConversionChart";
import RefundChart from "../components/charts/RefundChart";
import type { MetricResult } from "../lib/metrics/types";

function MetricChart({ metric }: { metric: MetricResult }) {
  const d = metric.chartData;
  if (d.kind === "weekly-net") return <WeeklyNetChart weeks={d.weeks} />;
  if (d.kind === "conversion") return <ConversionChart points={d.points} />;
  return <RefundChart points={d.points} />;
}

export default function Home() {
  const [overview, setOverview] = useState<OverviewDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/overview", { cache: "no-store" });
      if (!res.ok) throw new Error(`加载失败（${res.status}）`);
      setOverview((await res.json()) as OverviewDTO);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <header className="space-y-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">GameScope</h1>
          <span className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600">
            M0 端到端演示
          </span>
        </div>
        <p className="text-sm text-gray-600">
          独立游戏开发者数据分析助手：上传 Steamworks 导出的 CSV（或一键载入演示数据），
          查看 3 个首发指标模板。AI 自然语言问数、其余 12–15 个模板与账号体系将在 M1 交付。
        </p>
      </header>

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
              已接入数据（{overview.datasets.length} 份，重复上传同类报告会替换旧数据）
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
                      <span className="text-amber-700">
                        ⚠ {d.warnings.length} 项数据质量提示
                      </span>
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
        <h2 className="text-base font-semibold text-gray-800">② 指标看板</h2>
        {!overview ? (
          <p className="text-sm text-gray-500">加载中…</p>
        ) : !overview.hasData ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center text-gray-500">
            还没有数据。上传 Steamworks 导出的 CSV，或点击上方「一键载入演示数据」体验完整流程。
          </div>
        ) : (
          <div className="space-y-6">
            {overview.metrics.map((m) => (
              <MetricCard key={m.id} metric={m} chart={<MetricChart metric={m} />} />
            ))}
          </div>
        )}
      </section>

      <footer className="space-y-1 border-t border-gray-200 pt-4 text-xs leading-relaxed text-gray-500">
        <p>
          所有「健康区间 / 经验区间」均为独立游戏发行社区流传的经验值（GDC 演讲、发行商公开分享、行业媒体），
          非 Valve 官方标准，仅供参考。
        </p>
        <p>
          M0 范围：脚手架 + CSV 解析器 + 3 个指标模板端到端。数据仅存于本地 SQLite（data/gamescope.db）。
          演示数据为虚构游戏《星尘旅人》。
        </p>
      </footer>
    </main>
  );
}
