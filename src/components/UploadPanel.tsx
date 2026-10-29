"use client";

import { useRef, useState } from "react";
import type { FileUploadResult } from "../lib/api-types";

export default function UploadPanel({
  onRefresh,
}: {
  onRefresh: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FileUploadResult[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function post(url: string, body?: FormData) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(url, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `请求失败（${res.status}）`);
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload() {
    const files = inputRef.current?.files;
    if (!files || files.length === 0) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    try {
      const json = await post("/api/data/upload", fd);
      setResults(json.files as FileUploadResult[]);
      setNote(null);
      onRefresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "上传失败");
    }
  }

  async function handleDemo() {
    try {
      const json = await post("/api/data/demo");
      setResults(json.files as FileUploadResult[]);
      setNote("已载入演示数据：虚构独立游戏《星尘旅人》2026-02-16 ~ 2026-10-25 全周期数据。");
      onRefresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "载入失败");
    }
  }

  async function handleReset() {
    try {
      await post("/api/data/reset");
      setResults(null);
      setNote("已清空所有数据。");
      onRefresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "操作失败");
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,text/csv,text/plain"
          onChange={handleUpload}
          className="text-sm text-gray-500 file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-700"
        />
        <button
          onClick={handleUpload}
          disabled={busy}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          重新上传已选文件
        </button>
        <button
          onClick={handleDemo}
          disabled={busy}
          className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
        >
          一键载入演示数据
        </button>
        <button
          onClick={handleReset}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100 disabled:opacity-50"
        >
          清空数据
        </button>
        <span className="text-xs text-gray-400">
          支持：愿望单 · 流量与转化 · 销售（含退款）报告，自动识别文件类型
        </span>
      </div>

      {busy && <p className="text-sm text-gray-500">处理中…</p>}
      {note && <p className="text-sm text-gray-700">{note}</p>}

      {results && results.length > 0 && (
        <ul className="space-y-2">
          {results.map((r, i) => (
            <li
              key={i}
              className={`rounded-lg border px-3 py-2 text-sm ${
                r.ok
                  ? "border-green-200 bg-green-50 text-green-900"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <span className="font-medium">{r.filename}</span>
              {r.ok ? (
                <>
                  {" "}
                  · {r.kindLabel} · {r.rowCount} 行 ·{" "}
                  {r.dateMin} ~ {r.dateMax}
                  {r.skipped && r.skipped.length > 0 && (
                    <div className="mt-1 text-red-700">
                      跳过 {r.skipped.length} 行：
                      <ul className="ml-4 list-disc">
                        {r.skipped.slice(0, 5).map((s, j) => (
                          <li key={j}>
                            第 {s.rowNo} 行：{s.message}
                          </li>
                        ))}
                        {r.skipped.length > 5 && (
                          <li>…共 {r.skipped.length} 处</li>
                        )}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <> — {r.error}</>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
