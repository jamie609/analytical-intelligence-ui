"use client";
import React from "react";

interface InsightSection {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  items: string[];
}

export function InsightBlock({ analysis }: { analysis: string }) {
  const cleaned = analysis
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .trim();

  const summaryMatch = cleaned.match(/SUMMARY:\s*(.+?)(?=\n\n|KEY FINDINGS|$)/si);
  const findingsMatch = cleaned.match(/KEY FINDINGS:\s*([\s\S]+?)(?=\n\nOPPORTUNITIES|\n\nRISK FLAGS|$)/si);
  const oppsMatch = cleaned.match(/OPPORTUNITIES:\s*([\s\S]+?)(?=\n\nRISK FLAGS|$)/si);
  const risksMatch = cleaned.match(/RISK FLAGS:\s*([\s\S]+?)$/si);

  const parseItems = (t: string) => t.split("\n").map((l) => l.trim().replace(/^\d+\.\s*/, "").trim()).filter((l) => l.length > 10);

  const sections: InsightSection[] = [];
  if (findingsMatch)
    sections.push({
      label: "Key Findings",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
      color: "#0B2463", bg: "#f1f5f9", border: "#cbd5e1", items: parseItems(findingsMatch[1]),
    });
  if (oppsMatch)
    sections.push({
      label: "Opportunities",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
      color: "#43A047", bg: "#f0fdf4", border: "#bbf7d0", items: parseItems(oppsMatch[1]),
    });
  if (risksMatch)
    sections.push({
      label: "Risk Flags",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
      color: "#dc2626", bg: "#fef2f2", border: "#fecaca", items: parseItems(risksMatch[1]),
    });

  const fallback = sections.length === 0 ? cleaned.split("\n").map((l) => l.trim().replace(/^\d+\.\s*/, "").trim()).filter((l) => l.length > 10) : [];

  return (
    <div style={{ marginTop: 16, animation: "fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
      {summaryMatch && (
        <div style={{ background: "#0B2463", color: "#ffffff", borderRadius: "10px 10px 0 0", padding: "14px 18px", fontSize: 14, lineHeight: 1.5, fontWeight: 500, display: "flex", gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#43A047" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          {summaryMatch[1].trim()}
        </div>
      )}
      <div style={{ background: sections.length > 0 ? "#ffffff" : "transparent", border: sections.length > 0 ? "1px solid #cbd5e1" : "none", borderTop: "none", borderRadius: summaryMatch ? "0 0 10px 10px" : 10, padding: sections.length > 0 ? "20px" : "4px 0", boxShadow: sections.length > 0 ? "0 2px 8px rgba(0,0,0,0.02)" : "none" }}>
        {sections.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {sections.map((sec, si) => (
              <div key={si}>
                <div style={{ fontSize: 12, fontWeight: 700, color: sec.color, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  {sec.icon} {sec.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sec.items.map((item, ii) => (
                    <div key={ii} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: sec.bg, border: `1px solid ${sec.border}`, borderRadius: 8, padding: "12px 14px" }}>
                      <span style={{ flexShrink: 0, width: 22, height: 22, minWidth: 22, background: sec.color, color: "#fff", borderRadius: "50%", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {ii + 1}
                      </span>
                      <span style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, paddingTop: 1 }}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ whiteSpace: "pre-wrap", color: "#334155", fontSize: 14, lineHeight: 1.6 }}>
            {cleaned}
          </div>
        )}
      </div>
    </div>
  );
}