import type { CaliberInfo, TeachingCardInfo } from "../lib/metrics/types";
import type { SanityWarning } from "../lib/types";

/** D4 信任机制：口径链路（定义/公式/字段/行数/时间范围）必须完整展示。 */
export function CaliberPanel({ caliber }: { caliber: CaliberInfo }) {
  const rows: { k: string; v: React.ReactNode }[] = [
    { k: "定义", v: caliber.definition },
    {
      k: "公式",
      v: (
        <code className="block rounded border border-gray-200 bg-white px-2 py-1 font-mono text-xs leading-relaxed">
          {caliber.formula}
        </code>
      ),
    },
    { k: "使用字段", v: caliber.fields.join("、") },
    { k: "参与行数", v: `${caliber.rowCount} 行` },
    {
      k: "时间范围",
      v: caliber.dateRange
        ? `${caliber.dateRange.from} ~ ${caliber.dateRange.to}`
        : "—",
    },
  ];
  if (caliber.windowNote) rows.push({ k: "统计窗口", v: caliber.windowNote });
  rows.push({
    k: "数据来源",
    v: caliber.sourceFiles.length > 0 ? caliber.sourceFiles.join("、") : "—",
  });

  return (
    <section
      className="rounded-xl border border-gray-200 bg-gray-50 p-4"
      aria-label="计算口径"
    >
      <h3 className="mb-2 text-sm font-semibold text-gray-700">计算口径（口径透明）</h3>
      <dl className="grid grid-cols-[7em_1fr] gap-x-3 gap-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.k} className="contents">
            <dt className="text-gray-500">{r.k}</dt>
            <dd className="text-gray-800">{r.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** D7 教学卡片：是什么 / 为什么这么算 / 健康区间 / 下一步该问什么。 */
export function TeachingCard({ teaching }: { teaching: TeachingCardInfo }) {
  const items = [
    ["是什么", teaching.what],
    ["为什么这么算", teaching.why],
    ["健康区间", teaching.range],
    ["下一步问什么", teaching.next],
  ] as const;
  return (
    <section
      className="rounded-xl border-l-4 border-indigo-400 bg-indigo-50/60 p-4"
      aria-label="教学卡片"
    >
      <h3 className="mb-2 text-sm font-semibold text-indigo-900">教学卡片</h3>
      <dl className="grid grid-cols-[7em_1fr] gap-x-3 gap-y-1.5 text-sm">
        {items.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-indigo-900/60">{k}</dt>
            <dd className="text-gray-700">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** F5 sanity check 结果：异常显著提示，而非静默输出。 */
export function WarningList({ warnings }: { warnings: SanityWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <section aria-label="数据质量提示" className="space-y-1.5">
      {warnings.map((w, i) => (
        <p
          key={i}
          className={`rounded-lg border px-3 py-2 text-sm ${
            w.level === "warn"
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-gray-200 bg-gray-50 text-gray-600"
          }`}
        >
          ⚠ {w.message}
        </p>
      ))}
    </section>
  );
}
