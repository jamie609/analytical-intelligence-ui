"use client";
import React from "react";
import type { QueryResult } from "@/lib/api";

function truncate(s: string, n = 40) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function ShareModal({
  result,
  question,
  onClose,
}: {
  result: QueryResult;
  question: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const [teamsCopied, setTeamsCopied] = React.useState(false);
  const subject = encodeURIComponent("SQL Analyst: " + question.slice(0, 60));
  const plainText = [
    "SQL Analyst Report",
    "",
    "Question: " + question,
    "Result: " + result.row_count.toLocaleString() + " rows × " + result.columns.length + " columns",
    "Source: " + (result.source === "cache" ? "Cache Hit" : "AI Generated"),
    "",
    result.sql_query ? "SQL Query:\n" + result.sql_query : "",
    "",
    result.analysis ? "Insights:\n" + result.analysis.replace(/`/g, "").replace(/\*\*/g, "").trim() : "",
  ].filter(Boolean).join("\n");
  const encodedBody = encodeURIComponent(plainText);

  const shareViaOutlook = () => {
    window.location.href = "mailto:?subject=" + subject + "&body=" + encodedBody;
  };

  const shareViaTeams = () => {
    const msg =
      "SQL Analyst Report\n\nQuestion: " + question +
      "\n\nResult: " + result.row_count.toLocaleString() + " rows × " + result.columns.length + " columns" +
      (result.sql_query ? "\n\nSQL Query:\n" + result.sql_query.slice(0, 400) : "") +
      (result.analysis ? "\n\nInsights:\n" + result.analysis.replace(/`{3}[\s\S]*?`{3}/g, "").replace(/\*{2}(.*?)\*{2}/g, "$1").trim().slice(0, 600) : "");
    navigator.clipboard.writeText(msg).then(() => {
      setTeamsCopied(true);
      const a = document.createElement("a");
      a.href = "msteams://";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => { if (!document.hidden) window.open("https://teams.microsoft.com", "_blank"); }, 1000);
      setTimeout(() => setTeamsCopied(false), 4000);
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(plainText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#ffffff", borderRadius: 16, padding: 28, width: 440, boxShadow: "0 20px 40px rgba(0,0,0,0.1)", animation: "fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }} onClick={(e) => e.stopPropagation()}>
        
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: "#0B2463" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
              Share Result
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
              {truncate(question, 50)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4, borderRadius: 6, transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#0B2463"} onMouseLeave={e => e.currentTarget.style.color = "#64748b"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          {[{ label: "Rows", value: result.row_count.toLocaleString() }, { label: "Columns", value: String(result.columns.length) }, { label: "Source", value: result.source === "cache" ? "Cache Hit" : "AI Generated" }].map((s) => (
            <div key={s.label} style={{ flex: 1, background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2463", marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {/* Teams */}
          <button onClick={shareViaTeams} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 10, border: teamsCopied ? "1px solid #bbf7d0" : "1px solid #cbd5e1", background: teamsCopied ? "#f0fdf4" : "#ffffff", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }} onMouseEnter={e => { if(!teamsCopied) e.currentTarget.style.backgroundColor = "#f8fafc"; }} onMouseLeave={e => { if(!teamsCopied) e.currentTarget.style.backgroundColor = "#ffffff"; }}>
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill={teamsCopied ? "#43A047" : "#6264A7"} />
              {teamsCopied ? <polyline points="8 17 13 22 24 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /> : <text x="16" y="22" textAnchor="middle" fill="white" fontSize="15" fontWeight="bold" fontFamily="system-ui, sans-serif">T</text>}
            </svg>
            <div style={{ textAlign: "left" }}>
              {teamsCopied ? (
                <><div style={{ fontSize: 14, fontWeight: 600, color: "#166534" }}>Copied! Teams is opening…</div><div style={{ fontSize: 12, color: "#43A047", fontWeight: 500 }}>Press <kbd style={{ background: "#ffffff", border: "1px solid #bbf7d0", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontFamily: "monospace", color: "#166534" }}>Ctrl+V</kbd> in any Teams chat</div></>
              ) : (
                <><div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Microsoft Teams</div><div style={{ fontSize: 12, color: "#64748b" }}>Copies report + opens app</div></>
              )}
            </div>
          </button>

          {/* Outlook */}
          <button onClick={shareViaOutlook} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "#ffffff"}>
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#0078D4" />
              <text x="16" y="22" textAnchor="middle" fill="white" fontSize="15" fontWeight="bold" fontFamily="system-ui, sans-serif">O</text>
            </svg>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Outlook / Email</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Opens mail app with report pre-filled</div>
            </div>
            <svg style={{ marginLeft: "auto", flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
          </button>

          {/* Copy */}
          <button onClick={copyToClipboard} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "#ffffff"}>
            <div style={{ width: 36, height: 36, background: copied ? "#f0fdf4" : "#f1f5f9", border: copied ? "1px solid #bbf7d0" : "1px solid #e2e8f0", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}>
              {copied ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#43A047" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: copied ? "#166534" : "#0f172a" }}>{copied ? "Copied!" : "Copy to clipboard"}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Paste into any app — Teams, Slack, Notion…</div>
            </div>
          </button>
        </div>

        <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
          <strong style={{ color: "#0B2463" }}>Includes:</strong> question, {result.sql_query ? "SQL query, " : ""}result summary{result.analysis ? ", AI insights" : ""}
        </div>
      </div>
    </div>
  );
}