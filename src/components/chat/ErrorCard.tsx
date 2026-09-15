"use client";
import React, { useState } from "react";
import type { MessageErrorInfo } from "@/lib/types";

// ── Icon helpers ───────────────────────────────────────────────────────────────
function WarningTriangle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function DatabaseIcon({ size = 14, color = "#7C1C1C" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  );
}

function RetryIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
    </svg>
  );
}

function ChevronDown({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
  );
}

function ChevronUp({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
  );
}

// ── Error type metadata ────────────────────────────────────────────────────────
const ERROR_META: Record<string, { title: string; icon: React.ReactNode; badge: string }> = {
  SQL_EXECUTION: { title: "SQL Execution Error",   icon: <DatabaseIcon color="#7C1C1C" />, badge: "SQL_EXECUTION" },
  SQL_SYNTAX:    { title: "SQL Syntax Error",       icon: <DatabaseIcon color="#7C1C1C" />, badge: "SQL_SYNTAX"    },
  PERMISSION:    { title: "Permission Denied",      icon: <DatabaseIcon color="#4C1D95" />, badge: "PERMISSION"    },
  TIMEOUT:       { title: "Query Timeout",          icon: <DatabaseIcon color="#92400E" />, badge: "TIMEOUT"       },
  NETWORK:       { title: "Connection Error",       icon: <DatabaseIcon color="#1E3A8A" />, badge: "NETWORK"       },
  AI_PROVIDER:   { title: "AI Provider Error",      icon: <DatabaseIcon color="#1E3A8A" />, badge: "AI_PROVIDER"   },
  UNKNOWN:       { title: "Query Error",            icon: <DatabaseIcon color="#374151" />, badge: "UNKNOWN"       },
};

// ── Classify error type from message string ────────────────────────────────────
function classifyError(msg: string): { type: string; rootCause: string } {
  const m = msg.toLowerCase();
  if (m.includes("invalid object name") || m.includes("invalid column name")) {
    const match = msg.match(/['"]([^'"]+)['"]/);
    const ref   = match ? match[1] : "a table or column";
    return { type: "SQL_EXECUTION", rootCause: `The AI generated SQL that referenced a non-existent column or table: '${ref}'. An automatic fix was attempted but also failed. Try rephrasing your question using exact column names.` };
  }
  if (m.includes("syntax error") || m.includes("incorrect syntax")) return { type: "SQL_SYNTAX", rootCause: "The generated SQL contains a syntax error. This can happen with complex queries. Try simplifying your question or adding more context." };
  if (m.includes("permission") || m.includes("access denied") || m.includes("unauthorized")) return { type: "PERMISSION", rootCause: "You do not have permission to access the requested data. Contact your database administrator." };
  if (m.includes("timeout") || m.includes("timed out")) return { type: "TIMEOUT", rootCause: "The query took too long to execute. Try narrowing your question (e.g., add a date range or TOP N limit)." };
  if (m.includes("connection") || m.includes("network") || m.includes("unreachable")) return { type: "NETWORK", rootCause: "Could not reach the database server. Check your connection settings and try again." };
  if (m.includes("api") || m.includes("openai") || m.includes("gemini") || m.includes("ollama")) return { type: "AI_PROVIDER", rootCause: "The AI provider returned an error. Check your API key or model selection, then retry." };
  return { type: "UNKNOWN", rootCause: "An unexpected error occurred. Please try again or rephrase your question." };
}

function hintFor(type: string): string {
  switch (type) {
    case "SQL_EXECUTION":
    case "SQL_SYNTAX": return "The generated SQL was invalid. Try rephrasing, or check that the data you're asking about exists in this database.";
    case "PERMISSION": return "Your account does not have access to this table or schema. Contact your DB admin.";
    case "TIMEOUT": return "Add a TOP N limit or date filter to reduce query size.";
    case "NETWORK": return "Make sure your database connection is still active (reconnect if needed).";
    case "AI_PROVIDER": return "Check your API key and model settings in the sidebar.";
    default: return "If this keeps happening, try reconnecting to the database or switching AI provider.";
  }
}

// ── Theme colours per error type ───────────────────────────────────────────────
function themeFor(type: string) {
  const themes: Record<string, { cardBg: string; cardBorder: string; leftBar: string; badgeBg: string; badgeColor: string; labelColor: string; msgBg: string; msgBorder: string; msgText: string; rootText: string }> = {
    SQL_EXECUTION: { cardBg: "#FFF5F5", cardBorder: "#FECACA", leftBar: "#DC2626", badgeBg: "#0B2463", badgeColor: "#f8fafc", labelColor: "#B91C1C", msgBg: "#FEE2E2", msgBorder: "#FCA5A5", msgText: "#7C1C1C", rootText: "#991B1B" },
    SQL_SYNTAX:    { cardBg: "#FFFBEB", cardBorder: "#FDE68A", leftBar: "#D97706", badgeBg: "#0B2463", badgeColor: "#f8fafc", labelColor: "#92400E", msgBg: "#FEF3C7", msgBorder: "#FCD34D", msgText: "#78350F", rootText: "#92400E" },
    PERMISSION:    { cardBg: "#F5F3FF", cardBorder: "#C4B5FD", leftBar: "#7C3AED", badgeBg: "#0B2463", badgeColor: "#f8fafc", labelColor: "#4C1D95", msgBg: "#EDE9FE", msgBorder: "#C4B5FD", msgText: "#4C1D95", rootText: "#5B21B6" },
    TIMEOUT:       { cardBg: "#FFFBEB", cardBorder: "#FDE68A", leftBar: "#D97706", badgeBg: "#0B2463", badgeColor: "#f8fafc", labelColor: "#92400E", msgBg: "#FEF3C7", msgBorder: "#FCD34D", msgText: "#78350F", rootText: "#92400E" },
    NETWORK:       { cardBg: "#EFF6FF", cardBorder: "#BFDBFE", leftBar: "#2563EB", badgeBg: "#0B2463", badgeColor: "#f8fafc", labelColor: "#1E3A8A", msgBg: "#DBEAFE", msgBorder: "#93C5FD", msgText: "#1E3A8A", rootText: "#1D4ED8" },
    AI_PROVIDER:   { cardBg: "#EFF6FF", cardBorder: "#BFDBFE", leftBar: "#2563EB", badgeBg: "#0B2463", badgeColor: "#f8fafc", labelColor: "#1E3A8A", msgBg: "#DBEAFE", msgBorder: "#93C5FD", msgText: "#1E3A8A", rootText: "#1D4ED8" },
    UNKNOWN:       { cardBg: "#F9FAFB", cardBorder: "#E5E7EB", leftBar: "#6B7280", badgeBg: "#0B2463", badgeColor: "#f8fafc", labelColor: "#374151", msgBg: "#F3F4F6", msgBorder: "#D1D5DB", msgText: "#374151", rootText: "#374151" },
  };
  return themes[type] ?? themes.UNKNOWN;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ErrorCard component
// ─────────────────────────────────────────────────────────────────────────────
interface ErrorCardProps {
  info:     MessageErrorInfo;
  onRetry?: (question: string) => void;
}

export function ErrorCard({ info, onRetry }: ErrorCardProps) {
  const [showSQL, setShowSQL] = useState(false);

  const classified = classifyError(info.message);
  const errorType  = info.error_type !== "UNKNOWN" ? info.error_type : classified.type;
  const rootCause  = info.root_cause && info.root_cause !== info.message ? info.root_cause : classified.rootCause;
  const hint   = hintFor(errorType);
  const hasSql = !!(info.sql_query);
  const meta   = ERROR_META[errorType] ?? ERROR_META.UNKNOWN;
  const t      = themeFor(errorType);

  return (
    <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "flex-start", animation: "fadeInUp 0.3s ease" }}>
      <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", background: t.leftBar, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", marginTop: 2, boxShadow: `0 2px 8px ${t.leftBar}55` }}>
        <WarningTriangle size={15} />
      </div>

      <div style={{ flex: 1, border: `1px solid ${t.cardBorder}`, borderLeft: `4px solid ${t.leftBar}`, borderRadius: 12, background: t.cardBg, overflow: "hidden", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${t.cardBorder}`, gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, background: t.msgBg, border: `1px solid ${t.msgBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {meta.icon}
            </span>
            <span style={{ fontWeight: 700, fontSize: 14, color: t.msgText }}>
              {meta.title}
            </span>
          </div>

          <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 6, letterSpacing: "0.05em", textTransform: "uppercase", background: t.badgeBg, color: t.badgeColor, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", flexShrink: 0 }}>
            {meta.badge.replace(/_/g, "_")}
          </span>
        </div>

        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.labelColor, letterSpacing: "0.06em", marginBottom: 8, textTransform: "uppercase" }}>Error Message</div>
            <div style={{ background: t.msgBg, border: `1px solid ${t.msgBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: t.msgText, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", lineHeight: 1.6, wordBreak: "break-word" }}>
              {info.message}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.labelColor, letterSpacing: "0.06em", marginBottom: 8, textTransform: "uppercase" }}>Root Cause</div>
            <div style={{ fontSize: 14, color: t.rootText, lineHeight: 1.6 }}>{rootCause}</div>
          </div>

          <div style={{ background: "#fefce8", border: "1px solid #fde047", borderRadius: 8, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: -2 }}>💡</span>
            <span style={{ fontSize: 13, color: "#854d0e", lineHeight: 1.5, fontWeight: 500 }}>{hint}</span>
          </div>

          {hasSql && (
            <div>
              <button onClick={() => setShowSQL(v => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: t.msgText, background: "#ffffff", border: `1px solid ${t.msgBorder}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, transition: "background 0.2s" }} onMouseEnter={e => (e.currentTarget.style.background = t.msgBg)} onMouseLeave={e => (e.currentTarget.style.background = "#ffffff")}>
                {showSQL ? <ChevronUp /> : <ChevronDown />} {showSQL ? "Hide failed SQL" : "Show failed SQL"}
              </button>
              {showSQL && (
                <pre style={{ marginTop: 10, background: "#0B2463", color: "#fca5a5", borderRadius: 10, padding: "16px", fontSize: 13, overflowX: "auto", lineHeight: 1.6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)" }}>
                  {info.sql_query}
                </pre>
              )}
            </div>
          )}

          {onRetry && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => onRetry(info.question ?? info.message)} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, background: t.leftBar, color: "#ffffff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 12px ${t.leftBar}40`, transition: "opacity 0.2s ease" }} onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")} onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                <RetryIcon /> Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function parseQueryError(rawMessage: string, sqlQuery?: string): import("@/lib/types").MessageErrorInfo {
  const { type, rootCause } = classifyError(rawMessage);
  return { message: rawMessage, error_type: type, root_cause: rootCause, sql_query: sqlQuery };
}