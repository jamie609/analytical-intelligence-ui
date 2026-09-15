"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/useAuth";
import {
  runQuery, fetchStats, deleteCacheEntry, flushCache, logout,
  type QueryResult, type CacheEntry, type DBStats, type Table, type SheetInfo,
} from "@/lib/api";
import { useRouter } from "next/navigation";

// ── Split components ──────────────────────────────────────────────────────────
import { MessageBubble } from "@/components/chat/MessageBubble";
import { SheetPickerModal } from "@/components/modals/SheetPickerModal";
import { FilePanel } from "@/components/files/FilePanel";
import { DataLineagePanel } from "@/components/files/DataLineagePanel";
import { parseQueryError } from "@/components/chat/ErrorCard";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Session { id: string; dbId?: number; title: string; createdAt: string; messages: Message[]; }
interface Message { id: string; role: "user" | "assistant"; content: string; result?: QueryResult; loading?: boolean; errorInfo?: import("@/lib/types").MessageErrorInfo; attachedFiles?: AttachedFile[]; rawPrompt?: string; }
interface AttachedFile { id: number; name: string; type: string; category: "structured" | "document" | "image_ocr" | "unknown"; rowCount: number; colCount: number; columns: string[]; sheetName: string | null; imagePreviewUrl?: string; }
interface SheetPickerData { fileName: string; sheets: SheetInfo[]; }
type SheetPickerQueue = SheetPickerData[];

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2); }
function fmtDate(iso: string) {
  const d = new Date(iso), today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function truncate(s: string, n = 40) { return s.length > n ? s.slice(0, n) + "…" : s; }

const QUICK_PROMPTS = [
  { 
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>, 
    label: "Data patterns",  
    q: "Show me patterns in the data with counts and categories" 
  },
  { 
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, 
    label: "Top customers",  
    q: "Analyze customer demographics and top customers by value" 
  },
  { 
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, 
    label: "Revenue trends", 
    q: "Show revenue by category and time periods with trends" 
  },
  { 
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, 
    label: "Sales insights", 
    q: "Analyze sales trends and key performance metrics" 
  },
  { 
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>, 
    label: "Table summary",  
    q: "Give me a summary of all tables and their row counts" 
  },
  { 
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>, 
    label: "Latest data",    
    q: "Show me the most recently added or modified records" 
  },
];

const MAX_ATTACHED = 50;

export default function Dashboard() {
  const enableVoice = process.env.NEXT_PUBLIC_ENABLE_VOICE !== "false";
  const { user, loading } = useAuth();
  const router = useRouter();

  // ── Unified Navigation State ──
  type PanelState = "none" | "files" | "lineage" | "cache" | "settings";
  const [activePanel, setActivePanel] = useState<PanelState>("none");
  const [lineageRefreshKey, setLineageRefreshKey] = useState(0);

  // ── AI provider ──
  const [provider, setProvider] = useState("OpenAI");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [simThreshold, setSimThreshold] = useState(0.85);
  const [ollamaModels, setOllamaModels] = useState<import("@/lib/api").OllamaModel[]>([]);
  const [ollamaFetching, setOllamaFetching] = useState(false);
  const [ollamaError, setOllamaError] = useState("");

  // ── DB connection ──
  const [connected, setConnected] = useState(false);
  const [database, setDatabase] = useState("");
  const [server, setServer] = useState("");
  const [dbName, setDbName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [winAuth, setWinAuth] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState("");
  const [stats, setStats] = useState<DBStats | null>(null);
  const [tables, setTables] = useState<Table[]>([]);

  // ── Chat ──
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // ── Voice ──
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [language, setLanguage] = useState("en-US");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const voiceStartTimeRef = useRef<number>(0);

  // ── Files ──
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingLabel, setUploadingLabel] = useState("");
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [sheetPickerQueue, setSheetPickerQueue] = useState<SheetPickerQueue>([]);
  const [sheetPickerTotal, setSheetPickerTotal] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── UI ──
  const [chatSearchText, setChatSearchText] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeSession?.messages]);

  // Handle Panel Navigation
  const togglePanel = (panel: PanelState) => {
    if (activePanel === panel) setActivePanel("none");
    else {
      setActivePanel(panel);
      if (panel === "cache") {
        import("@/lib/api").then(({ fetchCache }) => fetchCache().then(r => setCacheEntries(r.entries as CacheEntry[])));
      }
    }
  };

  // Auto-reconnect & Initial Loaders
  useEffect(() => {
    if (!user?.email || connected) return;
    const saved = localStorage.getItem("sql_analyst_conn");
    if (!saved) return;
    try {
      const conn = JSON.parse(saved);
      if (!conn.server || !conn.database) return;
      import("@/lib/api").then(({ connectDB }) => {
        connectDB(conn).then(res => {
          setServer(conn.server); setDbName(conn.database); setUsername(conn.username || ""); setPassword(conn.password || ""); setWinAuth(conn.windows_auth);
          setConnected(true); setDatabase(res.database); setHistoryLoaded(false);
        }).catch(() => localStorage.removeItem("sql_analyst_conn"));
      });
    } catch {}
  }, [user?.email, connected]);

  useEffect(() => {
    if (!connected || historyLoaded) return;
    setHistoryLoaded(true);
    import("@/lib/api").then(({ listSessions }) => {
      listSessions().then(({ sessions: db }) => {
        if (!db.length) return;
        setSessions(db.slice(0, 50).map(s => ({ id: String(s.id), dbId: s.id, title: s.title, createdAt: s.created_at, messages: [] })));
      }).catch(() => {});
    });
  }, [connected, historyLoaded]);

  useEffect(() => {
    if (!connected) return;
    fetchStats().then(setStats).catch(() => {});
    import("@/lib/api").then(({ fetchSchema }) => { fetchSchema().then(r => setTables(r.tables)).catch(() => {}); });
  }, [connected]);

  useEffect(() => {
    if (provider !== "Ollama") return;
    setOllamaFetching(true); setOllamaError("");
    import("@/lib/api").then(({ fetchOllamaModels }) =>
      fetchOllamaModels().then(res => { setOllamaModels(res.models); if (res.models.length) setModel(res.models[0].name); else setOllamaError("No models found."); })
      .catch(e => setOllamaError(e instanceof Error ? e.message : "Error")).finally(() => setOllamaFetching(false))
    );
  }, [provider]);

  // Keyboard & Paste Hooks
  useEffect(() => {
    if (!enableVoice) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.ctrlKey && e.shiftKey && e.code === "KeyM") { e.preventDefault(); if (isRecording) stopRecording(); else if (connected && !isTranscribing) startRecording(); } };
    window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording, isTranscribing, connected, enableVoice]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!connected) return;
      if (e.clipboardData?.getData("text/plain")?.trim()) return;
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault(); const blob = item.getAsFile(); if (!blob) return;
      const previewUrl = URL.createObjectURL(blob); const tempId = Date.now();
      setAttachedFiles(prev => [...prev, { id: tempId, name: `clipboard_${new Date().toLocaleTimeString()}.png`, type: "png", category: "image_ocr", rowCount: 0, colCount: 0, columns: [], sheetName: null, imagePreviewUrl: previewUrl }]);
      setUploadingFile(true); setUploadingLabel("clipboard image");
      try {
        const { uploadClipboardImage } = await import("@/lib/api");
        const buf = await blob.arrayBuffer(); const bytes = new Uint8Array(buf);
        let binary = ""; bytes.forEach(b => (binary += String.fromCharCode(b)));
        const res = await uploadClipboardImage(btoa(binary), `clipboard_${Date.now()}.png`);
        setAttachedFiles(prev => prev.map(f => f.id === tempId ? { id: res.file_id, name: res.file_name, type: res.file_type, category: res.category ?? "image_ocr", rowCount: res.row_count, colCount: res.col_count, columns: res.columns, sheetName: null, imagePreviewUrl: previewUrl } : f));
        inputRef.current?.focus();
      } catch { setAttachedFiles(prev => prev.filter(f => f.id !== tempId)); URL.revokeObjectURL(previewUrl); } finally { setUploadingFile(false); setUploadingLabel(""); }
    };
    window.addEventListener("paste", handlePaste); return () => window.removeEventListener("paste", handlePaste);
  }, [connected]);

  // Voice Functions
  function applyGrammarFixes(text: string): string {
    let result = text;
    const fixes: [RegExp, string][] = [ [/\bsum of\b/gi, "SUM"], [/\bcount of\b/gi, "COUNT"], [/\bcount star\b/gi, "COUNT(*)"], [/\baverage of\b/gi, "AVG"], [/\bmaximum of\b/gi, "MAX"], [/\bminimum of\b/gi, "MIN"], [/\bgroup bye\b/gi, "GROUP BY"], [/\bgroup by\b/gi, "GROUP BY"], [/\border bye\b/gi, "ORDER BY"], [/\border by\b/gi, "ORDER BY"] ];
    for (const [pattern, replacement] of fixes) result = result.replace(pattern, replacement);
    return result.trim();
  }

  const startRecording = () => {
    setVoiceError(""); finalTranscriptRef.current = "";
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) { setVoiceError("Voice not supported."); return; }
    const recognition: SpeechRecognition = new SpeechRecognitionAPI();
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = language;
    recognitionRef.current = recognition;
    recognition.onstart = () => { setIsRecording(true); voiceStartTimeRef.current = Date.now(); };
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscriptRef.current += applyGrammarFixes(event.results[i][0].transcript) + " ";
        else interim = event.results[i][0].transcript;
      }
      setInput((finalTranscriptRef.current + interim).trimStart());
    };
    recognition.onerror = () => { setIsRecording(false); };
    recognition.onend = () => { setIsRecording(false); setInput(applyGrammarFixes(finalTranscriptRef.current)); };
    recognition.start();
  };
  const stopRecording = () => { recognitionRef.current?.stop(); };

  // Core Actions
  async function newSession() {
    try {
      const { createSession } = await import("@/lib/api");
      const { session_id } = await createSession();
      const s: Session = { id: String(session_id), dbId: session_id, title: "New chat", createdAt: new Date().toISOString(), messages: [] };
      setSessions(prev => [s, ...prev]); setActiveSessionId(s.id); setInput(""); setActivePanel("none");
    } catch {
      const s: Session = { id: uid(), title: "New chat", createdAt: new Date().toISOString(), messages: [] };
      setSessions(prev => [s, ...prev]); setActiveSessionId(s.id); setInput(""); setActivePanel("none");
    }
  }

  const sendMessage = useCallback(async (text: string, cutoffMsgId?: string) => {
    const q = text.trim(); if (!q || sending) return;
    if (!connected) { alert("Connect to a database first."); return; }
    if (!apiKey && provider !== "Ollama") { alert("Enter an API key first."); return; }

    let sid = activeSessionId; let dbSessionId: number | undefined;
    if (!sid) {
      try {
        const { createSession } = await import("@/lib/api");
        const { session_id } = await createSession(); dbSessionId = session_id;
        const s: Session = { id: String(session_id), dbId: session_id, title: truncate(q, 32), createdAt: new Date().toISOString(), messages: [] };
        setSessions(prev => [s, ...prev]); setActiveSessionId(s.id); sid = s.id;
      } catch {
        const s: Session = { id: uid(), title: truncate(q, 32), createdAt: new Date().toISOString(), messages: [] };
        setSessions(prev => [s, ...prev]); setActiveSessionId(s.id); sid = s.id;
      }
    } else { dbSessionId = sessions.find(s => s.id === sid)?.dbId; }

    const userMsg: Message = { id: uid(), role: "user", content: q };
    const loadMsg: Message = { id: uid(), role: "assistant", content: "", loading: true };
    setSessions(prev => prev.map(s => {
      if (s.id !== sid) return s;
      const msgs = cutoffMsgId ? s.messages.slice(0, s.messages.findIndex(m => m.id === cutoffMsgId)) : s.messages;
      return { ...s, title: msgs.length === 0 ? truncate(q, 32) : s.title, messages: [...msgs, userMsg, loadMsg] };
    }));
    setInput(""); setSending(true);

    try {
      const result = await runQuery({ question: q, provider, model, api_key: provider !== "Ollama" ? apiKey : undefined, similarity_threshold: simThreshold, session_id: dbSessionId });
      const summary = result.row_count === 0 ? "The query returned no results." : result.source === "cache" ? `Retrieved from cache in ${Number(result.timing.cache_ms ?? 0).toFixed(0)} ms. Found ${result.row_count.toLocaleString()} records.` : `Query executed in ${Number(result.timing.model_ms).toFixed(0)} ms. Found ${result.row_count.toLocaleString()} records.`;
      const assistantMsg: Message = { id: loadMsg.id, role: "assistant", content: summary, result };
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, messages: s.messages.map(m => m.id === loadMsg.id ? assistantMsg : m) } : s));
    } catch (e: unknown) {
      const errMsg: Message = { id: loadMsg.id, role: "assistant", content: "Error executing query.", errorInfo: { ...parseQueryError(e instanceof Error ? e.message : "Query failed"), question: q } };
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, messages: s.messages.map(m => m.id === loadMsg.id ? errMsg : m) } : s));
    } finally { setSending(false); }
  }, [activeSessionId, connected, apiKey, provider, model, simThreshold, sending, sessions]);

  async function handleFileAnalysis(prompt: string, cutoffMsgId?: string, overrideFiles?: AttachedFile[]) {
    const filesToUse = overrideFiles || attachedFiles;
    if (filesToUse.length === 0 || !prompt.trim()) return;
    if (!apiKey && provider !== "Ollama") { alert("Enter an API key first."); return; }
    
    let targetFiles = filesToUse;
    if (filesToUse.length > 1 && !["compare", "comparison", "vs "].some(k => prompt.toLowerCase().includes(k))) {
      const matched = attachedFiles.filter(f => prompt.toLowerCase().includes(f.name.replace(/\.[^.]+$/, "").toLowerCase()));
      targetFiles = matched.length >= 1 ? matched : filesToUse;
    }

    let sid = activeSessionId; let dbSessionId: number | undefined;
    if (!sid) {
      try {
        const { createSession } = await import("@/lib/api");
        const { session_id } = await createSession(); dbSessionId = session_id;
        const s: Session = { id: String(session_id), dbId: session_id, title: truncate(prompt, 32), createdAt: new Date().toISOString(), messages: [] };
        setSessions(prev => [s, ...prev]); setActiveSessionId(s.id); sid = s.id;
      } catch {
        const s: Session = { id: uid(), title: truncate(prompt, 32), createdAt: new Date().toISOString(), messages: [] };
        setSessions(prev => [s, ...prev]); setActiveSessionId(s.id); sid = s.id;
      }
    } else { dbSessionId = sessions.find(s => s.id === sid)?.dbId; }

    const fileLabels = filesToUse.map(f => `📎 ${f.name}`).join("\n");
    const userMsg: Message = { id: uid(), role: "user", content: `${fileLabels}\n${prompt}`, attachedFiles: filesToUse, rawPrompt: prompt };
    const loadMsg: Message = { id: uid(), role: "assistant", content: "", loading: true };
    setSessions(prev => prev.map(s => {
      if (s.id !== sid) return s;
      const msgs = cutoffMsgId ? s.messages.slice(0, s.messages.findIndex(m => m.id === cutoffMsgId)) : s.messages;
      return { ...s, title: msgs.length === 0 ? truncate(prompt, 32) : s.title, messages: [...msgs, userMsg, loadMsg] };
    }));
    if (!overrideFiles) setInput(""); setSending(true);

    try {
      let analysisText = ""; let cached = false; let summaryText = ""; let chartCols: string[] = []; let chartRows: unknown[][] = [];
      let execMs = 0; let cacheMs = 0;
      if (targetFiles.length > 1) {
        const { compareFiles } = await import("@/lib/api");
        const result = await compareFiles({ file_ids: targetFiles.map(f => f.id), prompt, provider, model, api_key: provider !== "Ollama" ? apiKey : undefined, base_url: "http://localhost:11434", session_id: dbSessionId });
        analysisText = result.analysis; cached = result.cached; execMs = result.execution_time_ms ?? 0; cacheMs = result.cache_ms ?? 0;
        summaryText = `${cached ? "⚡ Cached · " : ""}Compared ${result.file_count} file(s)`;
        chartCols = result.chart_data?.columns ?? []; chartRows = result.chart_data?.rows ?? [];
      } else {
        const { analyzeFile } = await import("@/lib/api");
        const result = await analyzeFile({ file_id: targetFiles[0].id, prompt, provider, model, api_key: provider !== "Ollama" ? apiKey : undefined, base_url: "http://localhost:11434", session_id: dbSessionId });
        analysisText = result.analysis; cached = result.cached; execMs = result.execution_time_ms ?? 0; cacheMs = result.cache_ms ?? 0;
        summaryText = `${cached ? "⚡ Cached · " : ""}Analysed ${targetFiles[0].name}`;
        chartCols = result.chart_data?.columns ?? []; chartRows = result.chart_data?.rows ?? [];
      }
      const assistantMsg: Message = { id: loadMsg.id, role: "assistant", content: summaryText, result: { question: prompt, sql_query: "", analysis: analysisText, columns: chartCols, rows: chartRows, row_count: chartRows.length, source: cached ? "cache" : "model", timing: { model_ms: execMs }, asked_at: new Date().toISOString(), completed_at: new Date().toISOString() } };
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, messages: s.messages.map(m => m.id === loadMsg.id ? assistantMsg : m) } : s));
    } catch (e: unknown) {
      const errMsg: Message = { id: loadMsg.id, role: "assistant", content: "File analysis failed.", errorInfo: { ...parseQueryError(e instanceof Error ? e.message : "Error"), question: prompt } };
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, messages: s.messages.map(m => m.id === loadMsg.id ? errMsg : m) } : s));
    } finally { setSending(false); }
  }

  async function handleConnect() {
    if (!server || !dbName) { setConnError("Server and database required."); return; }
    setConnecting(true); setConnError("");
    try {
      const { connectDB } = await import("@/lib/api");
      const res = await connectDB({ server, database: dbName, username: winAuth ? undefined : username, password: winAuth ? undefined : password, windows_auth: winAuth });
      setConnected(true); setDatabase(res.database); setActivePanel("none"); setHistoryLoaded(false);
      localStorage.setItem("sql_analyst_conn", JSON.stringify({ server, database: dbName, username: winAuth ? "" : username, password: winAuth ? "" : password, windows_auth: winAuth }));
    } catch (e: unknown) { setConnError(e instanceof Error ? e.message : "Connection failed"); }
    finally { setConnecting(false); }
  }

  function handleLogout() { logout(); router.push("/login"); }

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#64748b" }}>Loading…</div>;
  if (!user) return null;

  const filteredSessions = chatSearchText ? sessions.filter(s => s.title.toLowerCase().includes(chatSearchText.toLowerCase())) : sessions;
  const grouped: Record<string, Session[]> = {};
  filteredSessions.forEach(s => { const k = fmtDate(s.createdAt); grouped[k] = [...(grouped[k] ?? []), s]; });

  // Sub-component rendering for Top Nav Items
  const NavItem = ({ id, label, icon }: { id: PanelState, label: string, icon: React.ReactNode }) => {
    const isActive = activePanel === id;
    return (
      <button 
        onClick={() => togglePanel(id)} 
        style={{ 
          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", 
          fontSize: 14, fontWeight: isActive ? 700 : 600, 
          color: isActive ? "#0B2463" : "#64748b", background: "transparent", border: "none", cursor: "pointer", position: "relative", transition: "color 0.2s" 
        }}
        onMouseEnter={e => e.currentTarget.style.color = "#0B2463"}
        onMouseLeave={e => { if(!isActive) e.currentTarget.style.color = "#64748b" }}
      >
        {icon} {label}
        {isActive && <div style={{ position: "absolute", bottom: -21, left: 0, right: 0, height: 3, background: "#0B2463", borderRadius: "3px 3px 0 0", animation: "fadeInUp 0.2s ease" }} />}
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif", background: "#f8fafc", overflow: "hidden" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.8; transform: scale(0.95); } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        .qidesk-feature-card {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; text-align: left; cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .qidesk-feature-card:hover {
          transform: translateY(-4px); border-color: #43A047; box-shadow: 0 12px 24px rgba(11, 36, 99, 0.08);
        }
        .qidesk-feature-card:active {
          transform: translateY(0) scale(0.98);
        }
        .session-btn { transition: all 0.2s ease; }
        .session-btn:hover { background-color: #f1f5f9 !important; }
        
        /* Modern Scrollbar */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>

      {/* Sheet Picker Modal */}
      {sheetPickerOpen && sheetPickerQueue.length > 0 && (
        <SheetPickerModal
          key={sheetPickerQueue[0].fileName} data={sheetPickerQueue[0]}
          queuePosition={sheetPickerTotal > 1 ? { current: sheetPickerTotal - sheetPickerQueue.length + 1, total: sheetPickerTotal } : undefined}
          onSelect={(sheets) => {
            const currentFile = sheetPickerQueue[0];
            setAttachedFiles(prev => {
              const next = [...prev];
              for (const s of sheets) {
                if (next.some(p => p.name === `${currentFile.fileName} · ${s.sheet_name}`)) continue;
                const stableId = (s.file_id != null && s.file_id > 0) ? s.file_id : -(currentFile.fileName + s.sheet_name).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
                next.push({ id: stableId, name: `${currentFile.fileName} · ${s.sheet_name}`, type: "xlsx", category: "structured", rowCount: s.row_count ?? 0, colCount: s.col_count ?? 0, columns: s.columns ?? [], sheetName: s.sheet_name });
              }
              return next.slice(0, MAX_ATTACHED);
            });
            const remaining = sheetPickerQueue.slice(1);
            if (remaining.length > 0) { setSheetPickerQueue(remaining); } else { setSheetPickerOpen(false); setSheetPickerQueue([]); setSheetPickerTotal(0); }
          }}
          onClose={() => {
            const remaining = sheetPickerQueue.slice(1);
            if (remaining.length > 0) { setSheetPickerQueue(remaining); } else { setSheetPickerOpen(false); setSheetPickerQueue([]); setSheetPickerTotal(0); }
          }}
        />
      )}

      {/* ══════════ GLOBAL TOP NAVIGATION HEADER ══════════ */}
      <header style={{ height: 72, background: "#ffffff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", zIndex: 50, flexShrink: 0 }}>
        {/* Left: Logo & Core Nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <img src="/QFT-image.png" alt="Quinte Logo" style={{ height: 69, objectFit: "contain", cursor: "pointer" }} onClick={() => setActivePanel("none")} />
          
          <nav style={{ display: "flex", alignItems: "center", gap: 24, height: "100%", marginTop: 4 }}>
            <NavItem id="none" label="Workspace" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>} />
            <NavItem id="files" label="Files" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>} />
            <NavItem id="lineage" label="Lineage" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>} />
            <NavItem id="cache" label="Cache" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>} />
            <NavItem id="settings" label="Settings" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>} />
          </nav>
        </div>

        {/* Right: User & Primary CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0B2463" }}>{user.display_name}</div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{user.role}</div>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#0B2463" }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            </div>
            <button onClick={handleLogout} title="Sign out" style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", marginLeft: 4, transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#0B2463"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            </button>
          </div>

          <div style={{ width: 1, height: 32, background: "#e2e8f0" }} />
          
          <button onClick={newSession} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 8, background: "#43A047", color: "#ffffff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)", boxShadow: "0 4px 12px rgba(67, 160, 71, 0.2)" }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#388E3C"; e.currentTarget.style.transform = "translateY(-1px)"; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#43A047"; e.currentTarget.style.transform = "translateY(0)"; }} onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Chat
          </button>
        </div>
      </header>

      {/* ══════════ MAIN APPLICATION BODY ══════════ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* ── Chat History Sidebar ── */}
        <aside style={{ width: sidebarOpen ? 280 : 0, minWidth: sidebarOpen ? 280 : 0, background: "#ffffff", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.4s cubic-bezier(0.16, 1, 0.3, 1)", overflow: "hidden", flexShrink: 0, position: "relative" }}>
          
          {/* Collapse Toggle */}
          <button id="toggleMenuBtn" onClick={() => setSidebarOpen(false)} title="Collapse sidebar" style={{ position: "absolute", right: -14, top: 24, background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", color: "#475569", cursor: "pointer", zIndex: 50, transition: "all 0.2s ease" }} onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1)")} onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>

          <div style={{ width: 280, display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0B2463", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Chat History</div>
              <input type="text" placeholder="Search conversations..." value={chatSearchText} onChange={e => setChatSearchText(e.target.value)} style={{ width: "100%", padding: "10px 14px", fontSize: 13, borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", fontFamily: "inherit", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }} onFocus={e => e.target.style.borderColor = "#0B2463"} onBlur={e => e.target.style.borderColor = "#cbd5e1"} />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
              {filteredSessions.length === 0 ? (
                <div style={{ padding: "30px 12px", fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.6 }}>No history found.</div>
              ) : (
                Object.entries(grouped).map(([date, grp]) => (
                  <div key={date} style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.05em", textTransform: "uppercase", padding: "0 8px 8px", fontWeight: 700 }}>{date}</div>
                    {grp.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <button className="session-btn" onClick={async () => {
                          setActiveSessionId(s.id); setActivePanel("none");
                          if (s.dbId && s.messages.length === 0) {
                            try {
                              const { getSessionMessages } = await import("@/lib/api");
                              const { messages } = await getSessionMessages(s.dbId);
                              const expanded: Message[] = [];
                              for (const m of messages) {
                                expanded.push({ id: `u-${m.id}`, role: "user", content: m.question });
                                const summary = m.error ? `❌ ${m.error}` : m.source === "cache" ? `Retrieved from cache. Found ${(m.row_count ?? 0).toLocaleString()} records.` : `Query executed in ${(m.exec_ms ?? 0).toFixed(0)} ms. Found ${(m.row_count ?? 0).toLocaleString()} records.`;
                                expanded.push({ id: `a-${m.id}`, role: "assistant", content: summary, result: (m.sql_query || m.analysis || (Array.isArray(m.columns) && m.columns.length > 0)) ? { question: m.question, sql_query: m.sql_query, analysis: m.analysis, columns: Array.isArray(m.columns) ? m.columns : [], rows: [], row_count: m.row_count ?? 0, source: (m.source ?? "model") as "cache" | "model", timing: { model_ms: m.exec_ms ?? 0 }, asked_at: m.created_at, completed_at: m.created_at } : undefined });
                              }
                              setSessions(prev => prev.map(x => x.id === s.id ? { ...x, messages: expanded } : x));
                            } catch {}
                          }
                        }} style={{ flex: 1, textAlign: "left", padding: "10px 12px", borderRadius: 8, background: s.id === activeSessionId ? "#f1f5f9" : "transparent", color: s.id === activeSessionId ? "#0B2463" : "#475569", fontSize: 13, fontWeight: s.id === activeSessionId ? 600 : 500, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10, overflow: "hidden", border: "none" }}>
                          <svg className="flex-shrink-0" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                          {renamingSessionId === s.id ? (
                            <input autoFocus value={renameText} onChange={e => setRenameText(e.target.value)} onClick={e => e.stopPropagation()} onKeyDown={async e => { if (e.key === "Enter" && s.dbId) { try { const { renameSession } = await import("@/lib/api"); await renameSession(s.dbId, renameText); setSessions(prev => prev.map(x => x.id === s.id ? { ...x, title: renameText } : x)); } catch {} setRenamingSessionId(null); } else if (e.key === "Escape") { setRenamingSessionId(null); } }} onBlur={() => setRenamingSessionId(null)} style={{ flex: 1, background: "#fff", border: "1px solid #cbd5e1", color: "#0B2463", fontSize: 13, outline: "none", fontFamily: "inherit", padding: "2px 6px", borderRadius: 4 }} />
                          ) : (
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                          )}
                        </button>
                        
                        {renamingSessionId !== s.id && (
                          <button onClick={(e) => { e.stopPropagation(); setRenameText(s.title); setRenamingSessionId(s.id); }} title="Rename chat" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: s.id === activeSessionId ? 1 : 0, transition: "color 0.2s" }} onMouseEnter={e => (e.currentTarget.style.color = "#0B2463")} onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          </button>
                        )}
                        <button onClick={async (e) => { e.stopPropagation(); if (s.dbId) { try { const { deleteSessionById } = await import("@/lib/api"); await deleteSessionById(s.dbId); } catch {} } setSessions(prev => prev.filter(x => x.id !== s.id)); if (activeSessionId === s.id) setActiveSessionId(null); }} title="Delete chat" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: s.id === activeSessionId ? 1 : 0, transition: "color 0.2s" }} onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
            
            {/* Sidebar Footer Status */}
            <div style={{ padding: "16px 20px", background: "#f1f5f9", borderTop: "1px solid #e2e8f0" }}>
              {connected ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#15803d", fontWeight: 600 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.4)" }} />
                  {database}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>Not connected</div>
              )}
            </div>
          </div>
        </aside>

        {/* ── Main Chat Workspace ── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#f8fafc", position: "relative" }}>
          
          {/* Un-collapse Toggle */}
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} style={{ position: "absolute", left: 16, top: 16, background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, cursor: "pointer", color: "#64748b", zIndex: 10, boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: "40px 0" }}>
            <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 32px" }}>

              {/* Empty State / Dashboard Hero */}
              {(!activeSession || activeSession.messages.length === 0) && (
                <div style={{ paddingTop: 60 }}>
                  <div style={{ animation: "fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both", textAlign: "center", marginBottom: 60 }}>
                    <div style={{ width: 72, height: 72, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 12px 24px rgba(11, 36, 99, 0.06)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0B2463" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
                        <circle cx="17.5" cy="17.5" r="3.5" /><line x1="17.5" y1="15.5" x2="17.5" y2="19.5" /><line x1="15.5" y1="17.5" x2="19.5" y2="17.5" />
                      </svg>
                    </div>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: "#0B2463", margin: "0 0 12px 0", letterSpacing: "-0.02em" }}>
                      {connected ? `Connected to ${database}` : "SQL Analyst Workspace"}
                    </h1>
                    <p style={{ fontSize: 18, color: "#475569", margin: 0, fontWeight: 500 }}>
                      {connected ? "Ask any question about your data in plain English, or attach a file." : "Connect your database to begin automation and analysis."}
                    </p>
                    {!connected && (
                      <button onClick={() => setActivePanel("settings")} style={{ marginTop: 32, padding: "14px 32px", borderRadius: 10, background: "#43A047", color: "#ffffff", border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)", boxShadow: "0 4px 12px rgba(67, 160, 71, 0.2)" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#388E3C"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "#43A047"}>
                        Connect Database
                      </button>
                    )}
                  </div>
                  
                  {/* QiDesk Style Feature Cards (Quick Prompts) */}
                  {connected && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
                      {QUICK_PROMPTS.map((p, index) => (
                        <button key={p.q} className="qidesk-feature-card" onClick={() => sendMessage(p.q)} style={{ animation: "fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${0.1 + index * 0.05}s` }}>
                          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#f0fdf4", color: "#43A047", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                            {p.icon}
                          </div>
                          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0B2463", margin: "0 0 8px 0" }}>{p.label}</h3>
                          <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.6 }}>{truncate(p.q, 55)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Messages Iteration */}
              {activeSession?.messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} onEdit={(text) => setInput(text)} onRetry={(text) => { if (msg.attachedFiles && msg.attachedFiles.length > 0) { handleFileAnalysis(msg.rawPrompt || text.replace(/^📎 .*\n/gm, ''), msg.id, msg.attachedFiles); } else { sendMessage(text, msg.id); } }} onDelete={() => setSessions(prev => prev.map(s => { if (s.id !== activeSessionId) return s; const idx = s.messages.findIndex(m => m.id === msg.id); if (idx === -1) return s; const newMsgs = [...s.messages]; newMsgs.splice(idx, msg.role === "user" ? 2 : 1); return { ...s, messages: newMsgs }; }))} />
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* ── Input Bar ── */}
          <div style={{ background: "linear-gradient(to top, #f8fafc 80%, transparent)", padding: "20px 32px 32px", flexShrink: 0 }}>
            <div style={{ maxWidth: 900, margin: "0 auto" }}>
              
              {/* Attachments preview area */}
              {(attachedFiles.length > 0 || uploadingFile) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "flex-end" }}>
                  {uploadingFile && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 10, background: "#ffffff", border: "1px dashed #cbd5e1", fontSize: 12, color: "#64748b", fontWeight: 500 }}><div style={{ width: 14, height: 14, border: "2px solid #cbd5e1", borderTopColor: "#43A047", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} /> Uploading…</div>}
                  {attachedFiles.map(f => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#ffffff", borderRadius: 10, border: "1px solid #e2e8f0", maxWidth: 260, boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                      <div style={{ color: "#0B2463" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name.split(" · ")[0]}</div>
                        {f.name.includes(" · ") && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{f.name.split(" · ")[1]}</div>}
                      </div>
                      <button onClick={() => setAttachedFiles(prev => prev.filter(x => x.id !== f.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 20, padding: "12px 16px", boxShadow: "0 8px 30px rgba(11, 36, 99, 0.06)", transition: "border-color 0.3s" }} onFocus={e => e.currentTarget.style.borderColor = "#0B2463"} onBlur={e => e.currentTarget.style.borderColor = "#cbd5e1"}>
                
                {/* ── RESTORED: Hidden File Input ── */}
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.json,.tsv,.xml,.txt,.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.bmp,.tiff" style={{ display: "none" }} multiple
                  onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    if (files.length === 0 || !connected) return;
                    e.target.value = "";
                    if (attachedFiles.length + files.length > MAX_ATTACHED) { alert(`Maximum ${MAX_ATTACHED} files at once.`); return; }
                    const IMAGE_EXTS = ["png","jpg","jpeg","webp","bmp","tiff"];
                    setUploadingFile(true);
                    try {
                      const { uploadFile, uploadClipboardImage } = await import("@/lib/api");
                      const toQueue: SheetPickerData[] = [];
                      for (const file of files) {
                        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
                        setUploadingLabel(file.name);
                        if (IMAGE_EXTS.includes(ext)) {
                          const previewUrl = URL.createObjectURL(file);
                          const tempId = Date.now() + Math.random();
                          setAttachedFiles(prev => [...prev, { id: tempId, name: file.name, type: ext, category: "image_ocr", rowCount: 0, colCount: 0, columns: [], sheetName: null, imagePreviewUrl: previewUrl }]);
                          const buf = await file.arrayBuffer();
                          const bytes = new Uint8Array(buf);
                          let binary = ""; bytes.forEach(b => (binary += String.fromCharCode(b)));
                          const b64 = btoa(binary);
                          const res = await uploadClipboardImage(b64, file.name);
                          setAttachedFiles(prev => prev.map(f => f.id === tempId ? { id: res.file_id, name: res.file_name, type: res.file_type, category: res.category ?? "image_ocr", rowCount: res.row_count, colCount: res.col_count, columns: res.columns, sheetName: null, imagePreviewUrl: previewUrl } : f));
                        } else {
                          const res = await uploadFile(file);
                          if (res.is_multi_sheet && res.sheets && res.sheets.length > 0) toQueue.push({ fileName: res.file_name, sheets: res.sheets });
                          else setAttachedFiles(prev => prev.some(p => p.id === res.file_id) ? prev : [...prev, { id: res.file_id, name: res.file_name, type: res.file_type, category: "structured", rowCount: res.row_count, colCount: res.col_count, columns: res.columns, sheetName: res.sheet_names?.[0] ?? null }]);
                        }
                      }
                      if (toQueue.length > 0) { setSheetPickerQueue(toQueue); setSheetPickerTotal(toQueue.length); setSheetPickerOpen(true); }
                    } catch (err: unknown) { alert(err instanceof Error ? err.message : "Upload failed"); } finally { setUploadingFile(false); setUploadingLabel(""); }
                  }}
                />
                
                {/* ── RESTORED: Paperclip strictly opens system file explorer ── */}
                <button onClick={() => fileInputRef.current?.click()} disabled={!connected || uploadingFile} title="Attach file" style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, border: "none", background: "#f1f5f9", cursor: connected ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", transition: "all 0.2s" }} onMouseEnter={e => { if(connected) e.currentTarget.style.backgroundColor = "#e2e8f0"; }} onMouseLeave={e => e.currentTarget.style.backgroundColor = "#f1f5f9"}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                </button>

                {enableVoice && (
                  <button onClick={isRecording ? stopRecording : startRecording} disabled={!connected || isTranscribing} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, border: "none", background: isRecording ? "#fef2f2" : "#f1f5f9", cursor: connected ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", color: isRecording ? "#ef4444" : "#475569", transition: "all 0.2s" }} onMouseEnter={e => { if(connected && !isRecording) e.currentTarget.style.backgroundColor = "#e2e8f0"; }} onMouseLeave={e => { if(!isRecording) e.currentTarget.style.backgroundColor = "#f1f5f9"; }}>
                    {isTranscribing ? <div style={{ width: 18, height: 18, border: "2px solid #cbd5e1", borderTopColor: "#0B2463", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> : isRecording ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" /></svg> : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" /></svg>}
                  </button>
                )}

                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!isRecording) { if (attachedFiles.length > 0 && input.trim()) handleFileAnalysis(input.trim()); else sendMessage(input); } } }} placeholder={connected ? "Ask a question about your data or type to analyze..." : "Connect to a database first"} disabled={!connected || sending || uploadingFile} rows={1} style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 16, color: "#0f172a", fontFamily: "inherit", lineHeight: 1.5, maxHeight: 160, overflowY: "auto", paddingTop: 10, paddingBottom: 10, paddingLeft: 8 }} />

                <button onClick={() => { if (attachedFiles.length > 0 && input.trim()) handleFileAnalysis(input.trim()); else sendMessage(input); }} disabled={!input.trim() || sending || !connected} style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: input.trim() && connected && !sending ? "#43A047" : "#e2e8f0", border: "none", cursor: input.trim() && connected ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s" }}>
                  {sending ? <div style={{ width: 20, height: 20, border: "2.5px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.65s linear infinite" }} /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>}
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* ══════════ UNIFIED RIGHT-SIDE DRAWERS ══════════ */}
        {activePanel !== "none" && (
          <div style={{ width: 280, flexShrink: 0, background: "#ffffff", borderLeft: "1px solid #cbd5e1", display: "flex", flexDirection: "column", animation: "slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards", boxShadow: "-8px 0 30px rgba(0,0,0,0.03)", zIndex: 40 }}>
            
            {/* Drawer Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0B2463", display: "flex", alignItems: "center", gap: 8 }}>
                {activePanel === "settings" && <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg> Settings</>}
                {activePanel === "files" && <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> File Analysis</>}
                {activePanel === "lineage" && <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> Data Lineage</>}
                {activePanel === "cache" && <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg> Semantic Cache</>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Dynamic Controls based on Panel */}
                {activePanel === "lineage" && (
                  <button onClick={() => setLineageRefreshKey(k => k + 1)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6, border: "1px solid #cbd5e1", color: "#475569", background: "#ffffff", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 4 }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f1f5f9"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "#ffffff"}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refresh
                  </button>
                )}
                {activePanel === "cache" && user.role === "Admin" && (
                  <button onClick={async () => { await flushCache(); setCacheEntries([]); }} style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6, border: "1px solid #f87171", color: "#991b1b", background: "#fef2f2", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#fee2e2"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "#fef2f2"}>
                    Flush all
                  </button>
                )}
                <button onClick={() => setActivePanel("none")} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 6, borderRadius: 8, transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#e2e8f0"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
              {/* Settings Panel Content */}
              {activePanel === "settings" && (
                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 32 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#0B2463", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>AI Provider</div>
                    <select value={provider} onChange={e => { setProvider(e.target.value); setModel(e.target.value === "OpenAI" ? "gpt-4o-mini" : e.target.value === "Gemini" ? "gemini-1.5-flash" : ""); }} style={{ width: "100%", height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 12px", marginBottom: 12, color: "#0f172a", outline: "none", fontFamily: "inherit" }}>
                      <option>OpenAI</option><option>Gemini</option><option>Ollama</option>
                    </select>
                    {provider !== "Ollama" && (
                      <>
                        <input type="password" placeholder="API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} style={{ width: "100%", height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 12px", marginBottom: 12, color: "#0f172a", outline: "none", boxSizing: "border-box" }} />
                        <select value={model} onChange={e => setModel(e.target.value)} style={{ width: "100%", height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 12px", color: "#0f172a", outline: "none", fontFamily: "inherit" }}>
                          {provider === "OpenAI" ? ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"].map(m => <option key={m}>{m}</option>) : ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"].map(m => <option key={m}>{m}</option>)}
                        </select>
                      </>
                    )}
                    {provider === "Ollama" && (
                      <div style={{ marginTop: 4 }}>
                        {ollamaFetching ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px", background: "#f8fafc", borderRadius: 8, border: "1px solid #cbd5e1", color: "#64748b", fontSize: 12, fontWeight: 600 }}><div style={{ width: 14, height: 14, border: "2px solid #cbd5e1", borderTopColor: "#43A047", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Detecting models…</div>
                        ) : (
                          <>
                            <select value={model} onChange={e => setModel(e.target.value)} style={{ width: "100%", height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 13, padding: "0 12px", color: "#0f172a", outline: "none", fontFamily: "inherit", marginBottom: 12 }}>
                              {ollamaModels.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                            </select>
                            <button onClick={() => { setOllamaFetching(true); import("@/lib/api").then(({ fetchOllamaModels }) => fetchOllamaModels().then(r => { setOllamaModels(r.models); if (r.models.length) setModel(r.models[0].name); }).finally(() => setOllamaFetching(false))); }} style={{ padding: "8px 16px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#0B2463", cursor: "pointer", width: "100%" }}>↻ Refresh Models</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#0B2463", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Database Connection {connected && <span style={{ color: "#43A047", marginLeft: 4, textTransform: "none" }}>✓ Connected</span>}</div>
                    <input placeholder="Server" value={server} onChange={e => setServer(e.target.value)} style={{ width: "100%", height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 12px", marginBottom: 12, outline: "none", boxSizing: "border-box" }} />
                    <input placeholder="Database name" value={dbName} onChange={e => setDbName(e.target.value)} style={{ width: "100%", height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 12px", marginBottom: 12, outline: "none", boxSizing: "border-box" }} />
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 12, cursor: "pointer" }}><input type="checkbox" checked={winAuth} onChange={e => setWinAuth(e.target.checked)} style={{ accentColor: "#43A047", width: 16, height: 16 }} /> Windows Authentication</label>
                    {!winAuth && <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}><input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} style={{ height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 12px", outline: "none" }} /><input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ height: 40, borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 12px", outline: "none" }} /></div>}
                    <button onClick={handleConnect} disabled={connecting} style={{ width: "100%", height: 44, borderRadius: 8, background: "#43A047", color: "#ffffff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#388E3C"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "#43A047"}>{connecting ? "Connecting…" : connected ? "Reconnect" : "Connect Database"}</button>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#0B2463", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Semantic Cache</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Similarity threshold</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#0B2463" }}>{simThreshold.toFixed(2)}</span>
                    </div>
                    <input type="range" min={0.70} max={1.00} step={0.01} value={simThreshold} onChange={e => setSimThreshold(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#43A047", marginBottom: 6 }} />
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{simThreshold >= 0.95 ? "🔴 Very strict" : simThreshold >= 0.85 ? "🟡 Balanced" : "🟢 Aggressive"}</div>
                    
                    {tables.length > 0 && (
                      <div style={{ marginTop: 24 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#0B2463", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Tables ({tables.length})</div>
                        <div style={{ maxHeight: 180, overflowY: "auto", fontSize: 12, color: "#475569", background: "#f8fafc", padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}>
                          {tables.map((t, i) => (
                            <div key={t.full_name} style={{ padding: "6px 0", display: "flex", justifyContent: "space-between", borderBottom: i === tables.length - 1 ? "none" : "1px solid #e2e8f0" }}>
                              <span style={{fontWeight: 600, color: "#0f172a"}}>{t.full_name}</span>
                              <span style={{ color: "#64748b", fontFamily: "var(--font-mono)" }}>{t.row_count.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Other panels mount here natively */}
              {activePanel === "files" && <FilePanel provider={provider} model={model} apiKey={apiKey} connected={connected} onAnalysis={() => setActivePanel("none")} />}
              {activePanel === "lineage" && <DataLineagePanel refreshKey={lineageRefreshKey} />}
              {activePanel === "cache" && (
                <div style={{ padding: 16 }}>
                   {cacheEntries.length === 0 ? <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b", fontWeight: 500 }}>Cache is empty.</div> : (
                     <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                       {cacheEntries.map((e, idx) => (
                         <div key={e.id} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.02)", position: "relative", animation: "fadeInUp 0.3s ease both", animationDelay: `${idx * 0.05}s` }}>
                            {user.role === "Admin" && (
                              <button onClick={async () => { await deleteCacheEntry(e.id); setCacheEntries(p => p.filter(x => x.id !== e.id)); }} style={{ position: "absolute", top: 12, right: 12, fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", transition: "color 0.2s" }} onMouseEnter={ev => (ev.currentTarget.style.color = "#ef4444")} onMouseLeave={ev => (ev.currentTarget.style.color = "#94a3b8")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                            )}
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0B2463", marginBottom: 10, lineHeight: 1.5, paddingRight: 24 }}>"{e.user_question}"</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11, fontWeight: 600 }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", color: "#475569", padding: "4px 8px", borderRadius: 6 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
                                {e.provider}
                              </span>
                              <span style={{ display: "flex", alignItems: "center", gap: 4, background: "#e0e7ff", color: "#1e40af", padding: "4px 8px", borderRadius: 6 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                                {e.hit_count} hits
                              </span>
                              <span style={{ display: "flex", alignItems: "center", gap: 4, background: "#dcfce7", color: "#166534", padding: "4px 8px", borderRadius: 6 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                                {e.first_exec_ms?.toFixed(0)} ms
                              </span>
                            </div>
                         </div>
                       ))}
                     </div>
                   )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
