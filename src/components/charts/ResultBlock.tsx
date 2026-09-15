"use client";
import React, { useState } from "react";
import dynamic from "next/dynamic";
import type { QueryResult } from "@/lib/api";
import { downloadCSV } from "@/lib/csv";

// ── Lazy-load recharts — excluded from initial bundle ────────────────────────
const ChartRenderer = dynamic(
  () => import("@/components/charts/ChartRenderer").then((m) => m.ChartRenderer),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 13 }}>
        <div style={{ width: 16, height: 16, border: "2px solid #cbd5e1", borderTopColor: "#0B2463", borderRadius: "50%", animation: "spin 0.7s linear infinite", marginRight: 8 }} />
        Rendering charts…
      </div>
    ),
  }
);

// ── Helpers ──────────────────────────────────────────────────────────────────
function isNumeric(v: unknown): boolean {
  return v !== null && v !== "" && !isNaN(Number(v));
}

function buildCharts(result: QueryResult) {
  const { columns, rows } = result;
  if (!rows.length) return [];
  const numCols = columns.filter((_, i) => rows.slice(0, 8).every((r) => isNumeric((r as unknown[])[i])));
  const strCols = columns.filter((_, i) => rows.slice(0, 8).some((r) => !isNumeric((r as unknown[])[i])));
  const dateCols = columns.filter((c) => /date|time|month|year|period/i.test(c));
  const isCurrency = (k: string) => /total|revenue|sales|amount|price|cost/i.test(k);
  type C = { type: string; title: string; data: object[]; xKey: string; yKey: string; currency: boolean; };
  const charts: C[] = [];
  
  if (strCols.length && numCols.length) {
    const xKey = strCols[0], yKey = numCols[0], xi = columns.indexOf(xKey), yi = columns.indexOf(yKey);
    const data = rows.slice(0, 12).map((r) => ({ [xKey]: String((r as unknown[])[xi] ?? "").slice(0, 20), [yKey]: Number((r as unknown[])[yi]) || 0 }));
    charts.push({ type: "bar", title: `Top ${xKey} by ${yKey}`, data, xKey, yKey, currency: isCurrency(yKey) });
    if (rows.length >= 3) charts.push({ type: "pie", title: `${yKey} by ${xKey}`, data: data.slice(0, 8), xKey, yKey, currency: isCurrency(yKey) });
    if (data.length >= 4) charts.push({ type: "hbar", title: `Horizontal: ${yKey} by ${xKey}`, data: [...data].reverse(), xKey, yKey, currency: isCurrency(yKey) });
  }
  
  if (dateCols.length && numCols.length) {
    const xKey = dateCols[0], yKey = numCols[0], xi = columns.indexOf(xKey), yi = columns.indexOf(yKey);
    charts.push({ type: "line", title: `Trend: ${yKey} over time`, data: rows.slice(0, 24).map((r) => ({ [xKey]: String((r as unknown[])[xi] ?? "").slice(0, 10), [yKey]: Number((r as unknown[])[yi]) || 0 })), xKey, yKey, currency: isCurrency(yKey) });
  }
  return charts;
}

// ── ResultBlock ───────────────────────────────────────────────────────────────
export function ResultBlock({ result }: { result: QueryResult }) {
  const [tab, setTab] = useState<"table" | "charts" | "sql">("table");
  const charts = buildCharts(result);
  const isCache = result.source === "cache";
  const timing = result.timing;

  const handleDownloadPDF = async () => {
    const { downloadPDF } = await import("@/lib/pdf");
    await downloadPDF(result);
  };

  return (
    <div style={{ marginTop: 14, animation: "fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: isCache ? "#dcfce7" : "#f1f5f9", color: isCache ? "#166534" : "#0B2463", border: `1px solid ${isCache ? "#bbf7d0" : "#cbd5e1"}` }}>
          {isCache ? (
             <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Cache hit</>
          ) : (
             <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg> AI generated</>
          )}
        </span>
        {isCache && (
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>
            {String(timing.match_type) === "semantic" ? `Semantic (${(Number(timing.similarity) * 100).toFixed(0)}%)` : "Exact"} · {Number(timing.cache_ms ?? 0).toFixed(0)} ms
            {timing.first_exec_ms ? ` (orig. ${Number(timing.first_exec_ms).toFixed(0)} ms)` : ""}
          </span>
        )}
        {!isCache && (
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>
            {Number(timing.model_ms).toFixed(0)} ms
          </span>
        )}
        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500, marginLeft: "auto" }}>
          {result.row_count.toLocaleString()} rows × {result.columns.length} cols
        </span>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid #e2e8f0", alignItems: "center" }}>
        {(["table", "charts", "sql"] as const).filter((t) => t !== "sql" || result.sql_query).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 12px", fontSize: 13, fontWeight: tab === t ? 600 : 500,
                color: tab === t ? "#0B2463" : "#64748b", background: "none", border: "none", cursor: "pointer",
                borderBottom: tab === t ? "2px solid #0B2463" : "2px solid transparent",
                fontFamily: "inherit", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6, marginBottom: "-1px"
              }}
            >
              {t === "table" ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                : t === "charts" ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>}
              {t === "table" ? "Results" : t === "charts" ? `Charts (${charts.length})` : "SQL"}
            </button>
          ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, paddingBottom: 6 }}>
          <button onClick={() => downloadCSV(result)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", fontSize: 12, fontWeight: 500, borderRadius: 6, border: "1px solid #cbd5e1", background: "#ffffff", color: "#475569", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }} onMouseEnter={e => {e.currentTarget.style.backgroundColor="#f8fafc"; e.currentTarget.style.borderColor="#0B2463"; e.currentTarget.style.color="#0B2463"}} onMouseLeave={e => {e.currentTarget.style.backgroundColor="#ffffff"; e.currentTarget.style.borderColor="#cbd5e1"; e.currentTarget.style.color="#475569"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> CSV
          </button>
          <button onClick={handleDownloadPDF} title={tab === "charts" ? "Export PDF with charts" : "Switch to Charts tab first to include charts"} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", fontSize: 12, fontWeight: 500, borderRadius: 6, border: "1px solid #cbd5e1", background: "#ffffff", color: "#475569", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }} onMouseEnter={e => {e.currentTarget.style.backgroundColor="#f8fafc"; e.currentTarget.style.borderColor="#0B2463"; e.currentTarget.style.color="#0B2463"}} onMouseLeave={e => {e.currentTarget.style.backgroundColor="#ffffff"; e.currentTarget.style.borderColor="#cbd5e1"; e.currentTarget.style.color="#475569"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> PDF{tab === "charts" ? " ✓" : ""}
          </button>
        </div>
      </div>

      {/* Table */}
      {tab === "table" && (
        <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #cbd5e1", maxHeight: 400, overflowY: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, fontFamily: "inherit" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              <tr>
                {result.columns.map((c) => (
                  <th key={c} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 12, color: "#ffffff", letterSpacing: "0.02em", background: "#0B2463", borderBottom: "1px solid #cbd5e1", whiteSpace: "nowrap" }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 && result.row_count > 0 ? (
                <tr>
                  <td colSpan={Math.max(1, result.columns.length)} style={{ padding: "32px 16px", fontSize: 14, color: "#64748b", textAlign: "center", background: "#ffffff" }}>
                    Data is not stored in history to save space.<br />
                    Click <strong style={{color: "#0B2463"}}>Retry</strong> on the message above to re-run the query and view the results.
                  </td>
                </tr>
              ) : (
                result.rows.slice(0, 100).map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? "#ffffff" : "#f8fafc", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f1f5f9"} onMouseLeave={e => e.currentTarget.style.backgroundColor = ri % 2 === 0 ? "#ffffff" : "#f8fafc"}>
                    {(row as unknown[]).map((v, ci) => (
                      <td key={ci} style={{ padding: "10px 16px", fontSize: 13, color: "#334155", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {String(v ?? "")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {result.row_count > 100 && (
            <div style={{ padding: "10px 16px", fontSize: 12, color: "#64748b", background: "#f8fafc", borderTop: "1px solid #cbd5e1", fontWeight: 500 }}>
              Showing 100 of {result.row_count.toLocaleString()} rows
            </div>
          )}
        </div>
      )}

      {/* Charts — lazy loaded */}
      {tab === "charts" && <ChartRenderer charts={charts} />}

      {/* SQL */}
      {tab === "sql" && (
        <pre style={{ background: "#0B2463", color: "#e0e7ff", borderRadius: 8, padding: "16px", fontSize: 13, overflowX: "auto", lineHeight: 1.6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", margin: 0, boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)" }}>
          {result.sql_query}
        </pre>
      )}
    </div>
  );
}