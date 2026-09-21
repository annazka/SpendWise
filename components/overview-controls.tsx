"use client";

import { useState } from "react";

export type Period = "1" | "7" | "30" | "90" | "all";
const periods: [Period, string][] = [["1", "Today"], ["7", "Last 7 Days"], ["30", "Last 30 Days"], ["90", "Last 90 Days"], ["all", "All Time"]];

export function PeriodPicker({ value, onChange }: { value: Period; onChange(value: Period): void }) {
  return <details style={{ position: "relative", minWidth: 165, color: "#ffffff", zIndex: 20 }}>
    <summary style={{ cursor: "pointer", padding: "12px 16px", background: "#103764", border: "1px solid #35baff", borderRadius: 10, fontSize: 14, fontWeight: 700 }}>{periods.find(([key]) => key === value)?.[1]}</summary>
    <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 190, padding: 6, background: "#081d38", border: "1px solid #35baff", borderRadius: 12, boxShadow: "0 12px 32px #0009" }}>
      {periods.map(([key, label]) => <button key={key} type="button" aria-pressed={value === key} onClick={event => { onChange(key); event.currentTarget.closest("details")?.removeAttribute("open"); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 12px", borderRadius: 7, color: value === key ? "#00182c" : "#ffffff", background: value === key ? "#51dfff" : "#081d38", fontWeight: 600 }}>{label}</button>)}
    </div>
  </details>;
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
  const line = points.map(point => `${point.x},${point.y}`).join(" ");
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return <div style={{ minWidth: 0, width: "100%" }}>
    {selected && <div role="status" style={{ color: "#fff", background: "#103764", padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>{selected.date}, {format(selected.amount)}, {selected.count} receipts</div>}
    <svg viewBox="0 0 680 290" style={{ display: "block", width: "100%", height: "auto", minHeight: 180 }} aria-label="Daily receipt spending. Focus or tap a point for details.">
      <defs><linearGradient id="daily-spend-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#28cfff" stopOpacity=".45"/><stop offset="1" stopColor="#157eff" stopOpacity=".02"/></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(index => <g key={index}><line x1="90" x2="650" y1={55 + index * 47.5} y2={55 + index * 47.5} stroke="#194569"/><text x="80" y={59 + index * 47.5} textAnchor="end" fill="#c3d9f3" fontSize="11">{format(max * (1 - index / 4))}</text></g>)}
      {points.length > 1 && <><polygon points={`${points[0].x},245 ${line} ${points.at(-1)!.x},245`} fill="url(#daily-spend-area)"/><polyline points={line} fill="none" stroke="#49ddff" strokeWidth="2"/></>}
      {points.map(point => <g key={point.date} tabIndex={0} role="button" aria-label={`${point.date}, ${format(point.amount)}, ${point.count} receipts`} onFocus={() => setActive(point.date)} onMouseEnter={() => setActive(point.date)} onClick={() => setActive(point.date)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive(point.date); } }} style={{ cursor: "pointer" }}><circle cx={point.x} cy={point.y} r="14" fill="transparent"/><circle cx={point.x} cy={point.y} r={active === point.date ? 5 : 3.5} fill="#d9ffff" stroke="#37daff"/><title>{point.date}: {format(point.amount)}, {point.count} receipts</title></g>)}
      {ticks.filter(index => index >= 0).map(index => <text key={index} x={points[index]?.x} y="270" textAnchor="middle" fill="#c3d9f3" fontSize="11">{points[index]?.date}</text>)}
    </svg>
  </div>;
}
