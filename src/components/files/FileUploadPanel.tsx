"use client";
import React from "react";
import type { UploadedFile } from "@/lib/api";
import { InsightBlock } from "@/components/charts/InsightBlock";

const MAX_FILES_PANEL = 50;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXT_LIST = [
  "csv", "xlsx", "xls", "json", "tsv",
  "txt", "pdf", "doc", "docx", "ppt", "pptx",
  "png", "jpg", "jpeg", "webp", "bmp", "tiff",
];

const ALLOWED_ACCEPT = [
  ".csv",".xlsx",".xls",".json",".tsv",
  ".txt",".pdf",".doc",".docx",".ppt",".pptx",
  ".png",".jpg",".jpeg",".webp",".bmp",".tiff",
].join(",");

type GovernanceResult = {
  business_type: string | null;
  confidence:    number | null;
  flagged:       boolean;
  flag_reason:   string | null;
  policy_action: string | null;
  ocr_used:      boolean;
  columns:       string[];
  preview:       string[][];
  sql_table:     string | null;
  file_id:       number;
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function FileUploadPanel({ provider, model, apiKey, baseUrl, onAnalysis, onOpenPanel }: { provider: string; model: string; apiKey: string; baseUrl: string; onAnalysis: (text: string) => void; onOpenPanel?: () => void; }) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<{stage: string; details: string} | null>(null);
  const [analysing, setAnalysing] = React.useState<number | null>(null);
  const [prompt, setPrompt] = React.useState("");
  const [activeFile, setActiveFile] = React.useState<number | null>(null);
  const [analysis, setAnalysis] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [govResult, setGovResult] = React.useState<GovernanceResult | null>(null);
  const [showSchemaPreview, setShowSchemaPreview] = React.useState(false);
  const [showManualReview, setShowManualReview] = React.useState(false);
  const [pendingApproval, setPendingApproval] = React.useState<GovernanceResult | null>(null);

  React.useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault(); const blob = item.getAsFile(); if (!blob) return;
      if (onOpenPanel) onOpenPanel();
      await uploadClipboard(blob);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [files.length]);

  React.useEffect(() => {
    import("@/lib/api").then(({ listFiles }) => {
      listFiles().then((r) => { if (r.files) setFiles(r.files.slice(0, MAX_FILES_PANEL)); }).catch(() => {});
    });
  }, []);

  async function uploadFile(file: File) {
    if (files.length >= MAX_FILES_PANEL) { setError(`Max ${MAX_FILES_PANEL} files allowed.`); return; }
    if (file.size > MAX_FILE_BYTES) { setError(`File too large. Max 50 MB.`); return; }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT_LIST.includes(ext)) { setError(`Unsupported file type (.${ext}).`); return; }
    setUploading(true); setError(""); setUploadProgress(null);
    try {
      const { uploadFile: apiUpload, listFiles } = await import("@/lib/api");
      const data = await apiUpload(file, (stage, details) => setUploadProgress({ stage, details }));
      const refreshed = await listFiles();
      setFiles(refreshed.files.slice(0, MAX_FILES_PANEL)); setActiveFile(data.file_id); handleGovernanceResponse(data);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setUploading(false); setUploadProgress(null); }
  }

  async function uploadClipboard(blob: Blob) {
    if (files.length >= MAX_FILES_PANEL) { setError(`Max ${MAX_FILES_PANEL} files allowed.`); return; }
    setUploading(true); setError(""); setUploadProgress(null);
    try {
      const { uploadClipboardImage, listFiles } = await import("@/lib/api");
      const buf = await blob.arrayBuffer(); const bytes = new Uint8Array(buf);
      let binary = ""; bytes.forEach((b) => (binary += String.fromCharCode(b)));
      const data = await uploadClipboardImage(btoa(binary), `clipboard_${Date.now()}.png`, (stage, details) => setUploadProgress({ stage, details }));
      const refreshed = await listFiles();
      setFiles(refreshed.files.slice(0, MAX_FILES_PANEL)); setActiveFile(data.file_id); handleGovernanceResponse(data);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Clipboard upload failed"); } finally { setUploading(false); setUploadProgress(null); }
  }

  function handleGovernanceResponse(data: import("@/lib/api").FileUploadResult) {
    const gov: GovernanceResult = { business_type: data.business_type ?? null, confidence: data.confidence ?? null, flagged: data.flagged ?? false, flag_reason: data.flag_reason ?? null, policy_action: data.policy_action ?? null, ocr_used: data.ocr_used ?? false, columns: data.columns ?? [], preview: data.preview ?? [], sql_table: data.sql_table ?? null, file_id: data.file_id };
    setGovResult(gov);
    if (data.policy_action === "manual_review") { setPendingApproval(gov); setShowManualReview(true); } 
    else if (data.flagged && data.policy_action === "warn") { setPendingApproval(gov); setShowSchemaPreview(true); }
  }

  async function runAnalysis() {
    if (!activeFile || !prompt.trim()) return;
    setAnalysing(activeFile); setError("");
    try {
      const { analyzeFile } = await import("@/lib/api");
      const data = await analyzeFile({ file_id: activeFile, prompt: prompt.trim(), provider, model, api_key: apiKey || undefined, base_url: baseUrl });
      const fileCategory = (data as { file_category?: string }).file_category ?? "unknown";
      const hasTable = (data.chart_data?.columns?.length ?? 0) > 0 && (data.chart_data?.rows?.length ?? 0) > 0;
      let summary = "";
      if (hasTable) summary = `${data.cached ? "⚡ Cached" : "🧠 AI"} analysis of **${data.file_name}** — found ${(data.chart_data?.rows?.length ?? 0).toLocaleString()} rows`;
      else if (fileCategory === "structured" && (data.row_count ?? 0) > 0) summary = `${data.cached ? "⚡ Cached" : "🧠 AI"} analysis of **${data.file_name}** (${(data.row_count ?? 0).toLocaleString()} rows)`;
      else summary = `${data.cached ? "⚡ Cached" : "🧠 AI"} analysis of **${data.file_name}**`;
      
      setAnalysis((prev) => ({ ...prev, [String(activeFile)]: data.analysis }));
      onAnalysis(summary + ":\n\n" + data.analysis);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Analysis failed"); } finally { setAnalysing(null); }
  }

  async function deleteFile(id: number) {
    try {
      const { deleteFile: apiDelete, listFiles } = await import("@/lib/api");
      await apiDelete(id); const refreshed = await listFiles();
      setFiles(refreshed.files.slice(0, MAX_FILES_PANEL));
      if (activeFile === id) setActiveFile(null);
      const a = { ...analysis }; delete a[String(id)]; setAnalysis(a);
    } catch { /* swallow */ }
  }

  const active = files.find((f) => f.id === activeFile);

  const getFileIcon = (ext: string) => {
    const t = ext.toLowerCase();
    if (['csv','tsv','xlsx','xls','json'].includes(t)) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
    if (['pdf'].includes(t)) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h1a2 2 0 0 0 0-4H9c-.5 0-1 .5-1 1v4c0 .5.5 1 1 1h1"/></svg>;
    if (['doc','docx','txt','rtf'].includes(t)) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
    if (['ppt','pptx'].includes(t)) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>;
    if (['htm','html','edge'].includes(t)) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>;
  };

  return (
    <>
    <div style={{ border: "1px solid #cbd5e1", borderRadius: 12, overflow: "hidden", background: "#fff", marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
      <div style={{ background: "#f8fafc", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #cbd5e1" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B2463" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0B2463" }}>File Analysis</span>
        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{files.length}/{MAX_FILES_PANEL} files</span>
      </div>

      <div style={{ padding: 20 }}>
        {/* Drop zone */}
        <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }} onClick={() => !uploading && files.length < MAX_FILES_PANEL && inputRef.current?.click()}
          style={{ border: `2px dashed ${dragging ? "#0B2463" : "#cbd5e1"}`, borderRadius: 10, padding: "20px 16px", textAlign: "center", cursor: files.length >= MAX_FILES_PANEL ? "not-allowed" : "pointer", background: dragging ? "#f1f5f9" : files.length >= MAX_FILES_PANEL ? "#f8fafc" : "#ffffff", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)", marginBottom: 16 }}>
          <input ref={inputRef} type="file" accept={ALLOWED_ACCEPT} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
          {uploading ? (
            <UploadProgressDisplay progress={uploadProgress} />
          ) : files.length >= MAX_FILES_PANEL ? (
            <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>File limit reached. Delete a file to upload more.</span>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg></div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Drop any file here, or <strong>Ctrl+V</strong> to paste a screenshot</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>CSV · Excel · PDF · DOCX · PPTX · TXT · JSON · Images · Max 50 MB</div>
            </div>
          )}
        </div>

        {error && <div style={{ fontSize: 12, color: "#991b1b", background: "#fef2f2", border: "1px solid #f87171", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontWeight: 500 }}>{error}</div>}

        {files.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {files.map((f) => (
              <div key={f.id} onClick={() => setActiveFile(f.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, cursor: "pointer", background: f.id === activeFile ? "#f1f5f9" : "#ffffff", border: f.id === activeFile ? "1.5px solid #0B2463" : "1px solid #e2e8f0", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)", boxShadow: f.id === activeFile ? "0 4px 12px rgba(11, 36, 99, 0.05)" : "none" }}>
                <div style={{ color: "#0B2463", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {getFileIcon(f.file_type)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file_name}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {f.category === "structured" ? `${f.row_count?.toLocaleString() ?? 0} rows · ${f.col_count ?? 0} cols · ${fmtSize(f.file_size)}` : f.category === "document" ? `Document · ${fmtSize(f.file_size)}` : f.category === "image_ocr" ? `Image (OCR) · ${fmtSize(f.file_size)}` : fmtSize(f.file_size)}
                  </div>
                  {f.sheet_name && <div style={{ fontSize: 10, color: "#0B2463", fontWeight: 600, marginTop: 2 }}>{f.sheet_name}</div>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }} title="Remove file" style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, borderRadius: 4, transition: "color 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {active && (
          <div style={{ animation: "fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {active.columns.slice(0, 12).map((c) => <span key={c} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "#f8fafc", border: "1px solid #cbd5e1", color: "#475569", fontWeight: 500 }}>{c}</span>)}
              {active.columns.length > 12 && <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500, padding: "4px 0" }}>+{active.columns.length - 12} more</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAnalysis(); } }} placeholder={`Ask about ${active.file_name}…`} disabled={analysing !== null} style={{ flex: 1, height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#ffffff", fontSize: 13, padding: "0 12px", fontFamily: "inherit", outline: "none", transition: "border-color 0.2s" }} onFocus={e => e.currentTarget.style.borderColor = "#0B2463"} onBlur={e => e.currentTarget.style.borderColor = "#cbd5e1"} />
              <button onClick={runAnalysis} disabled={!prompt.trim() || !!analysing} style={{ padding: "0 16px", height: 40, borderRadius: 8, background: prompt.trim() && !analysing ? "#43A047" : "#e2e8f0", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: prompt.trim() && !analysing ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, transition: "background 0.2s" }}>
                {analysing ? <><div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.65s linear infinite" }} /> Analysing…</> : "Analyse"}
              </button>
            </div>
            {analysis[String(active.id)] && <InsightBlock analysis={analysis[String(active.id)]} />}
          </div>
        )}
      </div>
    </div>

    {/* ── Schema Preview Modal ── */}
    {showSchemaPreview && pendingApproval && (
      <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: 480, maxWidth: "95vw", boxShadow: "0 20px 40px rgba(0,0,0,0.1)", animation: "fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Schema Preview</h3>
            <span style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px", borderRadius: 99, background: "#fefce8", color: "#a16207", fontWeight: 700, border: "1px solid #fde047" }}>
              {pendingApproval.confidence !== null ? `${Math.round(pendingApproval.confidence * 100)}% Confidence` : "Warning"}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#475569", margin: "0 0 16px 0", lineHeight: 1.5 }}>
            Confidence is slightly below the required threshold for <strong>{pendingApproval.business_type ?? "this document type"}</strong>. Please review the detected schema before proceeding.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
            <button onClick={() => setShowSchemaPreview(false)} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={e=>e.currentTarget.style.backgroundColor="#e2e8f0"} onMouseLeave={e=>e.currentTarget.style.backgroundColor="#f8fafc"}>Dismiss</button>
            <button onClick={() => setShowSchemaPreview(false)} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#43A047", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={e=>e.currentTarget.style.backgroundColor="#388E3C"} onMouseLeave={e=>e.currentTarget.style.backgroundColor="#43A047"}>Approve & Continue</button>
          </div>
        </div>
      </div>
    )}

    {/* ── Manual Review Modal ── */}
    {showManualReview && pendingApproval && (
      <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: 560, maxWidth: "95vw", boxShadow: "0 20px 40px rgba(0,0,0,0.1)", animation: "fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0B2463" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Manual Review Required</h3>
            <span style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px", borderRadius: 99, background: "#fef2f2", color: "#b91c1c", fontWeight: 700, border: "1px solid #fca5a5" }}>
              {pendingApproval.confidence !== null ? `${Math.round(pendingApproval.confidence * 100)}% Confidence` : "Low Confidence"}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#475569", margin: "0 0 16px 0", lineHeight: 1.5 }}>
            This document did not meet the automatic processing threshold for <strong>{pendingApproval.business_type ?? "this document type"}</strong>. Please review the extraction result.
          </p>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0B2463", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Detected Data (Editable)</div>
            <VirtualizedGrid columns={pendingApproval.columns} data={pendingApproval.preview} onDataChange={(newData) => { setPendingApproval({ ...pendingApproval, preview: newData }); }} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowManualReview(false); setActiveFile(null); }} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={e=>e.currentTarget.style.backgroundColor="#fee2e2"} onMouseLeave={e=>e.currentTarget.style.backgroundColor="#fef2f2"}>Reject</button>
            <button onClick={() => setShowManualReview(false)} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#43A047", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={e=>e.currentTarget.style.backgroundColor="#388E3C"} onMouseLeave={e=>e.currentTarget.style.backgroundColor="#43A047"}>Approve Anyway</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── Virtualized Grid Component ──────────────────────────────────────────────
import { useVirtualizer } from "@tanstack/react-virtual";

function VirtualizedGrid({ columns, data, onDataChange }: { columns: string[]; data: string[][]; onDataChange: (newData: string[][]) => void; }) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const [gridData, setGridData] = React.useState<string[][]>(data);
  const [editingCell, setEditingCell] = React.useState<{row: number, col: number} | null>(null);

  const rowVirtualizer = useVirtualizer({ count: gridData.length, getScrollElement: () => parentRef.current, estimateSize: () => 36, overscan: 5 });
  const columnVirtualizer = useVirtualizer({ horizontal: true, count: columns.length, getScrollElement: () => parentRef.current, estimateSize: () => 140, overscan: 2 });

  const handleCellEdit = (rIndex: number, cIndex: number, newVal: string) => {
    const newData = [...gridData]; newData[rIndex] = [...newData[rIndex]]; newData[rIndex][cIndex] = newVal; setGridData(newData); onDataChange(newData);
  };

  if (!columns.length) return <div style={{ fontSize: 13, color: "#64748b", padding: 10 }}>No data to display.</div>;

  return (
    <div ref={parentRef} style={{ height: 280, width: "100%", overflow: "auto", border: "1px solid #cbd5e1", borderRadius: 8, background: "#ffffff", position: "relative", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)" }}>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: `${columnVirtualizer.getTotalSize()}px`, position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <React.Fragment key={virtualRow.key}>
            {columnVirtualizer.getVirtualItems().map((virtualColumn) => {
              const isEditing = editingCell?.row === virtualRow.index && editingCell?.col === virtualColumn.index;
              const val = gridData[virtualRow.index]?.[virtualColumn.index] ?? "";
              return (
                <div key={`${virtualRow.key}-${virtualColumn.key}`} onDoubleClick={() => setEditingCell({ row: virtualRow.index, col: virtualColumn.index })}
                  style={{ position: "absolute", top: 0, left: 0, width: `${virtualColumn.size}px`, height: `${virtualRow.size}px`, transform: `translateX(${virtualColumn.start}px) translateY(${virtualRow.start}px)`, borderRight: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", padding: "0 10px", display: "flex", alignItems: "center", fontSize: 12, color: "#334155", background: virtualRow.index % 2 === 0 ? "#ffffff" : "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "cell" }}>
                  {isEditing ? (
                    <input autoFocus defaultValue={val} onBlur={(e) => { handleCellEdit(virtualRow.index, virtualColumn.index, e.target.value); setEditingCell(null); }} onKeyDown={(e) => { if (e.key === "Enter") { handleCellEdit(virtualRow.index, virtualColumn.index, e.currentTarget.value); setEditingCell(null); } }} style={{ width: "100%", height: "100%", border: "2px solid #0B2463", outline: "none", fontSize: 12, padding: "0 4px", margin: 0, borderRadius: 4 }} />
                  ) : val}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      
      {/* Sticky Header Overlay */}
      <div style={{ position: "sticky", top: 0, zIndex: 2, height: 36, background: "#0B2463", width: `${columnVirtualizer.getTotalSize()}px` }}>
        {columnVirtualizer.getVirtualItems().map((virtualColumn) => (
          <div key={virtualColumn.key} style={{ position: "absolute", top: 0, left: 0, width: `${virtualColumn.size}px`, height: 36, transform: `translateX(${virtualColumn.start}px)`, borderRight: "1px solid #1e3a8a", padding: "0 10px", display: "flex", alignItems: "center", fontSize: 12, fontWeight: 600, color: "#ffffff", background: "#0B2463", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {columns[virtualColumn.index]}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Upload Progress Display ─────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { key: "routing",        label: "Routing",        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg> },
  { key: "extraction",     label: "Extracting",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
  { key: "classification", label: "Classifying",    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> },
  { key: "normalization",  label: "Normalizing",    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  { key: "policy",         label: "Validating",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> },
  { key: "error",          label: "Error",          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
];

function UploadProgressDisplay({ progress }: { progress: { stage: string; details: string } | null }) {
  const currentIdx = progress ? PIPELINE_STAGES.findIndex((s) => s.key === progress.stage) : -1;

  return (
    <div style={{ width: "100%", padding: "8px 0" }}>
      {/* Stage pipeline */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 12 }}>
        {PIPELINE_STAGES.filter(s => s.key !== "error").map((stage, idx) => {
          const isDone    = currentIdx > idx;
          const isActive  = currentIdx === idx;
          return (
            <React.Fragment key={stage.key}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 48 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: isDone ? "#f0fdf4" : isActive ? "#0B2463" : "#f1f5f9", color: isDone ? "#16a34a" : isActive ? "#ffffff" : "#cbd5e1", border: `2px solid ${isDone ? "#43A047" : isActive ? "#0B2463" : "#e2e8f0"}`, transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)", boxShadow: isActive ? "0 0 0 4px rgba(11, 36, 99, 0.1)" : "none", animation: isActive ? "pulse 1.5s ease-in-out infinite" : "none" }}>
                  {isDone ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : stage.icon}
                </div>
                <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 600, color: isDone ? "#16a34a" : isActive ? "#0B2463" : "#94a3b8", textAlign: "center", transition: "all 0.3s ease" }}>
                  {stage.label}
                </span>
              </div>
              {idx < PIPELINE_STAGES.filter(s => s.key !== "error").length - 1 && (
                <div style={{ flex: 1, height: 3, marginBottom: 18, background: isDone ? "#43A047" : "#e2e8f0", transition: "background 0.5s ease" }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Current details */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {progress?.stage !== "error" && (
          <div style={{ width: 14, height: 14, border: "2px solid #cbd5e1", borderTopColor: "#0B2463", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 12, fontWeight: 500, color: progress?.stage === "error" ? "#dc2626" : "#475569", textAlign: "center" }}>
          {progress?.details ?? "Preparing pipeline…"}
        </span>
      </div>
    </div>
  );
}