"use client";
import React from "react";
import type { UploadedFile, FileAnalysisResult } from "@/lib/api";
import { InsightBlock } from "@/components/charts/InsightBlock";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXT_LIST = ["csv", "xlsx", "xls"];

function fmtSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function FilePanel({
  provider,
  model,
  apiKey,
  connected,
  onAnalysis,
}: {
  provider: string;
  model: string;
  apiKey: string;
  connected: boolean;
  onAnalysis: (result: FileAnalysisResult, fileName: string, prompt: string) => void;
}) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [prompt, setPrompt] = React.useState("");
  const [error, setError] = React.useState("");
  const [uploadMsg, setUploadMsg] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!connected) return;
    import("@/lib/api").then(({ listFiles }) => {
      listFiles().then((r) => setFiles(r.files)).catch(() => {});
    });
  }, [connected]);

  const selectedFile = files.find((f) => f.id === selected);

  async function handleUpload(file: File) {
    setError(""); setUploadMsg("");
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (!ALLOWED_EXT_LIST.includes(ext)) { setError("Only CSV and Excel (.xlsx) files are supported."); return; }
    if (file.size > MAX_FILE_BYTES) { setError(`File too large. Max size is 50 MB.`); return; }
    setUploading(true);
    try {
      const { uploadFile, listFiles } = await import("@/lib/api");
      const result = await uploadFile(file);
      setUploadMsg(result.cached ? "File already cached — instant loading!" : "File uploaded successfully!");
      const refreshed = await listFiles();
      setFiles(refreshed.files); setSelected(result.file_id);
      setTimeout(() => setUploadMsg(""), 4000);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setUploading(false); }
  }

  async function handleAnalyze() {
    if (!selected || !prompt.trim()) return;
    setError(""); setAnalyzing(true);
    try {
      const { analyzeFile } = await import("@/lib/api");
      const result = await analyzeFile({ file_id: selected, prompt: prompt.trim(), provider, model, api_key: provider !== "Ollama" ? apiKey : undefined, base_url: "http://localhost:11434" });
      onAnalysis(result, result.file_name, prompt.trim());
      setPrompt("");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Analysis failed"); } finally { setAnalyzing(false); }
  }

  async function handleDelete(fileId: number) {
    try {
      const { deleteFile, listFiles } = await import("@/lib/api");
      await deleteFile(fileId);
      const refreshed = await listFiles();
      setFiles(refreshed.files);
      if (selected === fileId) setSelected(null);
    } catch { /* swallow */ }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#ffffff" }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #cbd5e1", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#0B2463" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            File Analysis
          </div>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{files.length}/5 files</div>
        </div>
        <div style={{ fontSize: 12, color: "#64748b" }}>Upload CSV or Excel files and ask questions about your data</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        {files.length < 5 && (
          <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }} onClick={() => !uploading && files.length < 5 && fileRef.current?.click()}
            style={{ border: `2px dashed ${dragging ? "#0B2463" : "#cbd5e1"}`, borderRadius: 12, padding: "24px 16px", textAlign: "center", cursor: "pointer", background: dragging ? "#f1f5f9" : "#f8fafc", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
            {uploading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <div style={{ width: 16, height: 16, border: "2px solid #cbd5e1", borderTopColor: "#43A047", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                <span style={{ fontSize: 13, color: "#0B2463", fontWeight: 600 }}>Uploading…</span>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Drop a file or click to browse</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>CSV, XLSX · Max 50 MB</div>
              </>
            )}
          </div>
        )}

        {uploadMsg && <div style={{ fontSize: 13, fontWeight: 500, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> {uploadMsg}</div>}
        {error && <div style={{ fontSize: 13, color: "#991b1b", background: "#fef2f2", border: "1px solid #f87171", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> {error}</div>}

        {files.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0B2463", textTransform: "uppercase", letterSpacing: "0.05em" }}>Your files</div>
            {files.map((f) => (
              <div key={f.id} onClick={() => setSelected(f.id === selected ? null : f.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", borderRadius: 8, cursor: "pointer", border: f.id === selected ? "1.5px solid #0B2463" : "1.5px solid #e2e8f0", background: f.id === selected ? "#f1f5f9" : "#ffffff", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)", boxShadow: f.id === selected ? "0 4px 12px rgba(11, 36, 99, 0.05)" : "none" }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: f.file_type === "csv" ? "#f0fdf4" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${f.file_type === "csv" ? "#bbf7d0" : "#cbd5e1"}` }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: f.file_type === "csv" ? "#166534" : "#0B2463" }}>{f.file_type.toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file_name}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{f.row_count?.toLocaleString()} rows · {f.col_count} cols · {fmtSize(f.file_size)}</div>
                  {f.sheet_name && <div style={{ fontSize: 10, color: "#0B2463", fontWeight: 600, marginTop: 2 }}>{f.sheet_name}</div>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(f.id); }} title="Remove file" style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, borderRadius: 4, transition: "color 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedFile && (
          <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px", border: "1px solid #e2e8f0", animation: "fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0B2463", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Columns in {selectedFile.file_name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedFile.columns.map((c) => (
                <span key={c} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "#ffffff", border: "1px solid #cbd5e1", color: "#475569", fontWeight: 500 }}>{c}</span>
              ))}
            </div>
          </div>
        )}

        {selectedFile && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0B2463", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ask about {selectedFile.file_name}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleAnalyze(); }} placeholder="e.g. What are the top 5 products?" disabled={analyzing}
                style={{ flex: 1, height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#ffffff", fontSize: 13, padding: "0 12px", fontFamily: "inherit", outline: "none", transition: "border-color 0.2s" }} onFocus={e => e.currentTarget.style.borderColor = "#0B2463"} onBlur={e => e.currentTarget.style.borderColor = "#cbd5e1"}
              />
              <button onClick={handleAnalyze} disabled={!prompt.trim() || analyzing}
                style={{ height: 40, padding: "0 16px", borderRadius: 8, border: "none", background: prompt.trim() && !analyzing ? "#43A047" : "#e2e8f0", color: "#fff", fontSize: 13, fontWeight: 600, cursor: prompt.trim() && !analyzing ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, transition: "background 0.2s" }} onMouseEnter={e => { if(prompt.trim() && !analyzing) e.currentTarget.style.backgroundColor = "#388E3C" }} onMouseLeave={e => { if(prompt.trim() && !analyzing) e.currentTarget.style.backgroundColor = "#43A047" }}>
                {analyzing ? <><div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.65s linear infinite" }} /> Analysing…</> : "Analyse"}
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["Summarize this data", "What are the key trends?", "Show top 5 by value", "Find anomalies or outliers", "What insights can you find?"].map((s) => (
                <button key={s} onClick={() => setPrompt(s)} style={{ fontSize: 11, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", fontWeight: 500 }} onMouseEnter={e => {e.currentTarget.style.backgroundColor = "#e2e8f0"; e.currentTarget.style.color = "#0B2463"}} onMouseLeave={e => {e.currentTarget.style.backgroundColor = "#f8fafc"; e.currentTarget.style.color = "#475569"}}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {files.length === 0 && !uploading && (
          <div style={{ textAlign: "center", paddingTop: 16, fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
            Upload a CSV or Excel file to start analysing your own data with AI. Files are cached — re-uploading the same file is instant.
          </div>
        )}
      </div>
    </div>
  );
}