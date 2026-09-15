"use client";
import React from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// QiDesk Brand Color Palette for Charts
const COLORS = [
  "#0B2463", // Deep Blue
  "#43A047", // QiDesk Green
  "#3b82f6", // Bright Blue
  "#10b981", // Emerald
  "#6366f1", // Indigo
  "#14b8a6", // Teal
  "#8b5cf6", // Violet
  "#f59e0b", // Amber
];

interface ChartDef {
  type: string;
  title: string;
  data: object[];
  xKey: string;
  yKey: string;
  currency: boolean;
}

export function ChartRenderer({ charts }: { charts: ChartDef[] }) {
  if (charts.length === 0) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "#64748b", fontSize: 13, background: "#f8fafc", borderRadius: 8, border: "1px dashed #cbd5e1" }}>
        No chart available
      </div>
    );
  }

  return (
    <div id="charts-section" style={{ display: "grid", gridTemplateColumns: charts.length > 1 ? "1fr 1fr" : "1fr", gap: 16, animation: "fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
      {charts.map((chart, i) => {
        const fmtTick = (v: unknown) => chart.currency ? `$${Number(v).toLocaleString()}` : Number(v).toLocaleString();
        const fmtTip = (v: unknown) => chart.currency ? `$${Number(v).toLocaleString()}` : String(Number(v).toLocaleString());

        // Get matching SVG icon based on chart type
        const getTitleIcon = (type: string) => {
          if (type === "bar") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
          if (type === "pie") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>;
          if (type === "hbar") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="14" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="10" y2="18"/></svg>;
          return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
        }

        return (
          <div key={i} style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 12, padding: "18px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0B2463", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
              {getTitleIcon(chart.type)} {chart.title}
            </div>
            <ResponsiveContainer width="100%" height={240}>
              {chart.type === "bar" ? (
                <BarChart data={chart.data} margin={{ top: 4, right: 8, left: 8, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey={chart.xKey} tick={{ fontSize: 11, fill: "#64748b" }} angle={-35} textAnchor="end" interval={0} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={fmtTick} width={70} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #cbd5e1", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }} formatter={(v: unknown) => [fmtTip(v), chart.yKey]} />
                  <Bar dataKey={chart.yKey} radius={[4, 4, 0, 0]}>
                    {chart.data.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              ) : chart.type === "hbar" ? (
                <BarChart layout="vertical" data={chart.data} margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={fmtTick} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                  <YAxis type="category" dataKey={chart.xKey} tick={{ fontSize: 11, fill: "#64748b" }} width={100} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #cbd5e1", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }} formatter={(v: unknown) => [fmtTip(v), chart.yKey]} />
                  <Bar dataKey={chart.yKey} radius={[0, 4, 4, 0]}>
                    {chart.data.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              ) : chart.type === "line" ? (
                <LineChart data={chart.data} margin={{ top: 4, right: 8, left: 8, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey={chart.xKey} tick={{ fontSize: 11, fill: "#64748b" }} angle={-35} textAnchor="end" interval={0} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={fmtTick} width={70} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #cbd5e1", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }} formatter={(v: unknown) => [fmtTip(v), chart.yKey]} />
                  <Line type="monotone" dataKey={chart.yKey} stroke="#43A047" strokeWidth={3} dot={{ r: 4, fill: "#43A047", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                </LineChart>
              ) : (
                <PieChart>
                  <Pie data={chart.data} dataKey={chart.yKey} nameKey={chart.xKey} cx="50%" cy="50%" outerRadius={85} innerRadius={40} label={({ name, percent }) => `${String(name).slice(0, 12)} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: "#cbd5e1" }}>
                    {chart.data.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #cbd5e1", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }} formatter={(v: unknown) => [fmtTip(v), chart.yKey]} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12, color: "#475569" }} />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}