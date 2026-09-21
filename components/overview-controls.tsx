"use client";

import { useState } from "react";

export type Period = "1" | "7" | "30" | "90" | "all";
const periods: [Period, string][] = [["1", "Today"], ["7", "Last 7 Days"], ["30", "Last 30 Days"], ["90", "Last 90 Days"], ["all", "All Time"]];

export function PeriodPicker({ value, onChange }: { value: Period; onChange(value: Period): void }) {
  return <label className="period-picker-native">
    <span aria-hidden="true">◷</span>
    <select aria-label="Total spend date range" value={value} onChange={(event) => onChange(event.target.value as Period)}>
      {periods.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" /></svg>
  </label>;
}

export function SpendingChart({ expenses, format }: { expenses: { date: string; amount: number }[]; format(value: number): string }) {
  const [active, setActive] = useState<string | null>(null);
  const totals = new Map<string, { amount: number; count: number }>();
  for (const expense of expenses) {
    const old = totals.get(expense.date) || { amount: 0, count: 0 };
    totals.set(expense.date, { amount: old.amount + expense.amount, count: old.count + 1 });
  }
  const days = [...totals].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...days.map(([, value]) => value.amount)) * 1.1;
  const first = Date.parse(days[0]?.[0] || "2000-01-01");
  const last = Date.parse(days.at(-1)?.[0] || "2000-01-01");
  const points = days.map(([date, value]) => ({ date, ...value, x: last === first ? 370 : 90 + (Date.parse(date) - first) / (last - first) * 560, y: 245 - value.amount / max * 190 }));
  const selected = points.find(point => point.date === active);
  const tooltipX = selected ? Math.max(92, Math.min(570, selected.x - 80)) : 0;
  const tooltipY = selected ? Math.max(4, selected.y - 72) : 0;
  const line = points.map(point => `${point.x},${point.y}`).join(" ");
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return <div style={{ minWidth: 0, width: "100%" }}>
    <svg viewBox="0 0 680 290" style={{ display: "block", width: "100%", height: "auto", minHeight: 180 }} aria-label="Daily receipt spending. Focus or tap a point for details.">
      <defs><linearGradient id="daily-spend-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#28cfff" stopOpacity=".45"/><stop offset="1" stopColor="#157eff" stopOpacity=".02"/></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(index => <g key={index}><line x1="90" x2="650" y1={55 + index * 47.5} y2={55 + index * 47.5} stroke="#194569"/><text x="80" y={59 + index * 47.5} textAnchor="end" fill="#c3d9f3" fontSize="11">{format(max * (1 - index / 4))}</text></g>)}
      {points.length > 1 && <><polygon points={`${points[0].x},245 ${line} ${points.at(-1)!.x},245`} fill="url(#daily-spend-area)"/><polyline points={line} fill="none" stroke="#49ddff" strokeWidth="2"/></>}
      {selected && <line x1={selected.x} x2={selected.x} y1={selected.y + 7} y2="245" stroke="#36d9ff" strokeDasharray="3 4" opacity=".45" />}
      {points.map(point => <g key={point.date} tabIndex={0} role="button" aria-label={`${point.date}, ${format(point.amount)}, ${point.count} receipts`} onBlur={() => setActive(null)} onFocus={() => setActive(point.date)} onMouseEnter={() => setActive(point.date)} onMouseLeave={() => setActive(null)} onClick={() => setActive(active === point.date ? null : point.date)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive(point.date); } }} style={{ cursor: "pointer" }}><circle cx={point.x} cy={point.y} r="16" fill="transparent"/><circle cx={point.x} cy={point.y} r={active === point.date ? 6 : 4} fill="#d9ffff" stroke="#37daff" strokeWidth="2"/><title>{point.date}: {format(point.amount)}, {point.count} receipts</title></g>)}
      {selected && <g role="status" pointerEvents="none" style={{ filter: "drop-shadow(0 8px 12px rgba(0,0,0,.45))" }}>
        <rect x={tooltipX} y={tooltipY} width="160" height="60" rx="9" fill="#071d43" stroke="#21cfff" />
        <text x={tooltipX + 12} y={tooltipY + 18} fill="#a9c9e9" fontSize="10">{selected.date} · {selected.count} receipt{selected.count === 1 ? "" : "s"}</text>
        <text x={tooltipX + 12} y={tooltipY + 42} fill="#ffffff" fontSize="15" fontWeight="700">{format(selected.amount)}</text>
      </g>}
      {ticks.filter(index => index >= 0).map(index => <text key={index} x={points[index]?.x} y="270" textAnchor="middle" fill="#c3d9f3" fontSize="11">{points[index]?.date}</text>)}
    </svg>
  </div>;
}
