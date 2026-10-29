import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GameScope — 独立游戏数据分析助手",
  description:
    "接入 Steam 数据后，用可信的指标口径看懂你的游戏生意。M0 端到端演示。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
