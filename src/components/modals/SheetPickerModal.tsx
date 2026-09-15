"use client";
import React from "react";
import type { SheetInfo } from "@/lib/api";
import type { SheetPickerData } from "@/lib/types";

export function SheetPickerModal({
  data,
  onSelect,
  onClose,
  queuePosition,
}: {
  data: SheetPickerData;
  onSelect: (sheets: SheetInfo[]) => void;
  onClose: () => void;
  queuePosition?: { current: number; total: number };
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  function toggle(sheetName: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(sheetName) ? next.delete(sheetName) : next.add(sheetName);
      return next;
    });
  }

  function confirm() {
    const chosen = data.sheets.filter((s) => selected.has(s.sheet_name));
    if (chosen.length === 0) return;
    onSelect(chosen);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 16,
          padding: 28,
          width: 480,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
          animation: "fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0B2463", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                Select sheets
              </div>
              {queuePosition && queuePosition.total > 1 && (
                <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 99, background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#0B2463", fontWeight: 700 }}>
                  File {queuePosition.current} of {queuePosition.total}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, fontWeight: 500 }}>
              {data.fileName} · {data.sheets.length} sheet{data.sheets.length !== 1 ? "s" : ""} detected
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4, borderRadius: 6, transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#0B2463"} onMouseLeave={e => e.currentTarget.style.color = "#64748b"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Select all / none */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button onClick={() => setSelected(new Set(data.sheets.map((s) => s.sheet_name)))} style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#e2e8f0"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "#f8fafc"}>
            Select all
          </button>
          <button onClick={() => setSelected(new Set())} style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#e2e8f0"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "#f8fafc"}>
            Clear
          </button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: selected.size > 0 ? "#0B2463" : "#64748b", fontWeight: selected.size > 0 ? 700 : 500, alignSelf: "center" }}>
            {selected.size} of {data.sheets.length} selected
          </span>
        </div>

        {/* Sheet list */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 24, paddingRight: 4 }}>
          {data.sheets.map((s, idx) => {
            const isSelected = selected.has(s.sheet_name);
            return (
              <label key={s.sheet_name ?? `sheet-${idx}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 10, cursor: "pointer", border: isSelected ? "1.5px solid #0B2463" : "1.5px solid #e2e8f0", background: isSelected ? "#f1f5f9" : "#ffffff", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)", boxShadow: isSelected ? "0 4px 12px rgba(11, 36, 99, 0.05)" : "none" }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggle(s.sheet_name)} style={{ accentColor: "#0B2463", width: 18, height: 18, flexShrink: 0, cursor: "pointer" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    {s.sheet_name}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
                    {s.row_count?.toLocaleString()} rows · {s.col_count} columns
                  </div>
                  {s.columns && s.columns.length > 0 && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                      {s.columns.slice(0, 5).join(", ")}
                      {s.columns.length > 5 ? ` … +${s.columns.length - 5} more` : ""}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#475569", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#e2e8f0"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "#f8fafc"}>
            {queuePosition && queuePosition.total > 1 ? "Skip file" : "Cancel"}
          </button>
          <button onClick={confirm} disabled={selected.size === 0} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: selected.size > 0 ? "#43A047" : "#e2e8f0", color: selected.size > 0 ? "#ffffff" : "#94a3b8", fontSize: 13, fontWeight: 600, cursor: selected.size > 0 ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6 }} onMouseEnter={e => { if(selected.size > 0) e.currentTarget.style.backgroundColor = "#388E3C" }} onMouseLeave={e => { if(selected.size > 0) e.currentTarget.style.backgroundColor = "#43A047" }}>
            {queuePosition && queuePosition.total > 1 ? `Attach ${selected.size} sheet${selected.size !== 1 ? "s" : ""} → Next` : `Attach ${selected.size > 0 ? selected.size + " " : ""}sheet${selected.size !== 1 ? "s" : ""}`}
            {selected.size > 0 && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>}
          </button>
        </div>
      </div>
    </div>
  );
}