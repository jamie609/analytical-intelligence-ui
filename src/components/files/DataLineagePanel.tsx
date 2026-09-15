"use client";
import React from "react";
import { fetchMetadataTables, MetadataTable } from "@/lib/api";

export function DataLineagePanel({
  onAttachFile,
  refreshKey,
}: {
  onAttachFile?: (file: MetadataTable) => void;
  refreshKey: number;
}) {
  const [tables, setTables] = React.useState<MetadataTable[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const loadData = React.useCallback(() => {
    setLoading(true);
    setError("");
    fetchMetadataTables()
      .then((res) => setTables(res.tables))
      .catch((err: Error) => setError(err.message ?? "Failed to load lineage"))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadData();
  }, [refreshKey, loadData]);

  return (
    <div style={{ background: "#ffffff", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        
        {/* ── States ── */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 13, padding: "8px 0", justifyContent: "center" }}>
            <div style={{ width: 14, height: 14, border: "2px solid #cbd5e1", borderTopColor: "#0B2463", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            Loading lineage data…
          </div>
        )}
        {!loading && error && (
          <div style={{ fontSize: 13, color: "#991b1b", background: "#fef2f2", border: "1px solid #f87171", borderRadius: 8, padding: "10px 14px" }}>{error}</div>
        )}
        {!loading && !error && tables.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 40, color: "#64748b" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>No Data Ingested</div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>Upload a file to see its AI processing trail here.</div>
          </div>
        )}

        {/* ── Lineage Timeline Cards ── */}
        {!loading && !error && tables.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {tables.map((table, tIdx) => (
              <div key={table.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "#ffffff", padding: "14px", borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.02)", animation: "fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${tIdx * 0.05}s` }}>
                
                {/* Timeline indicator node */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", flexShrink: 0, background: table.flagged ? "#fef2f2" : "#f0fdf4", border: `2px solid ${table.flagged ? "#ef4444" : "#43A047"}` }} />
                  {tIdx < tables.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 32, background: "#e2e8f0", marginTop: 4 }} />}
                </div>

                {/* Card Content (Stacked for 280px width) */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  
                  {/* Title & Date */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0B2463", lineHeight: 1.3, wordBreak: "break-word" }}>
                    {table.table_name}
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 500, marginTop: 4, marginBottom: 10 }}>
                    {new Date(table.uploaded_at).toLocaleString()}
                  </div>

                  {/* Badges */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 6px", borderRadius: 6, background: "#f8fafc", border: "1px solid #cbd5e1", color: "#475569", fontWeight: 600 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      {table.file_name.length > 20 ? table.file_name.slice(0, 17) + "..." : table.file_name}
                    </span>
                    {table.business_type && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 6px", borderRadius: 6, background: "#f1f5f9", color: "#0B2463", fontWeight: 700 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                        {table.business_type}
                      </span>
                    )}
                    {table.confidence !== null && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 6px", borderRadius: 6, fontWeight: 700, background: table.confidence >= 0.8 ? "#f0fdf4" : table.confidence >= 0.6 ? "#fefce8" : "#fef2f2", color: table.confidence >= 0.8 ? "#16a34a" : table.confidence >= 0.6 ? "#ca8a04" : "#dc2626" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/></svg>
                        {(table.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    {table.flagged ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 6px", borderRadius: 6, background: "#fef2f2", color: "#dc2626", fontWeight: 700 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        Flagged
                      </span>
                    ) : (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 6px", borderRadius: 6, background: "#f0fdf4", color: "#16a34a", fontWeight: 700 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Auto-processed
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div style={{ fontSize: 10, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
                    {table.row_count?.toLocaleString() ?? "?"} rows · {table.col_count ?? "?"} columns
                    {table.columns?.length > 0 && (
                      <div style={{ fontFamily: "var(--font-mono)", color: "#475569", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        [{table.columns.slice(0, 2).join(", ")}{table.columns.length > 2 ? ` +${table.columns.length - 2}` : ""}]
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {table.file_id && onAttachFile && (
                      <button onClick={() => onAttachFile(table)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#ffffff", background: "#0B2463", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#1e3a8a"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "#0B2463"}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Chat
                      </button>
                    )}
                    {table.file_id && (
                      <button onClick={async () => { if (confirm(`Delete ${table.file_name}?`)) { try { const { deleteFile } = await import("@/lib/api"); await deleteFile(table.file_id!); loadData(); } catch (err: any) { alert(err.message ?? "Failed to delete file"); } } }} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#ef4444", background: "#ffffff", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }} onMouseEnter={e => {e.currentTarget.style.backgroundColor = "#fef2f2"; e.currentTarget.style.borderColor = "#ef4444"}} onMouseLeave={e => {e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.borderColor = "#fecaca"}}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete
                      </button>
                    )}
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}