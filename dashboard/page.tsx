"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/useAuth";
import {
  runQuery,
  fetchStats,
  deleteCacheEntry,
  flushCache,
  logout,
  type QueryResult,
  type CacheEntry,
  type DBStats,
  type Table,
  type SheetInfo,
} from "@/lib/api";
import { useRouter } from "next/navigation";

// ── Split components ──────────────────────────────────────────────────────────
import { MessageBubble } from "@/components/chat/MessageBubble";
import { SheetPickerModal } from "@/components/modals/SheetPickerModal";
import { FileUploadPanel } from "@/components/files/FileUploadPanel";
import { FilePanel } from "@/components/files/FilePanel";
import { DataLineagePanel } from "@/components/files/DataLineagePanel";
import { parseQueryError } from "@/components/chat/ErrorCard";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Session {
  id: string;
  dbId?: number;
  title: string;
  createdAt: string;
  messages: Message[];
}
interface Message {
  id:        string;
  role:      "user" | "assistant";
  content:   string;
  result?:   QueryResult;
  loading?:  boolean;
  errorInfo?: import("@/lib/types").MessageErrorInfo;
  attachedFiles?: AttachedFile[];
  rawPrompt?: string;
}
interface AttachedFile {
  id: number;
  name: string;
  type: string;
  category: "structured" | "document" | "image_ocr" | "unknown"; 
  rowCount: number;
  colCount: number;
  columns: string[];
  sheetName: string | null;
  imagePreviewUrl?: string;  
}
interface SheetPickerData {
  fileName: string;
  sheets: SheetInfo[];
}
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
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>, 
    label: "Data patterns",  q: "Show me patterns in the data with counts and categories" 
  },
  { 
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, 
    label: "Top customers",  q: "Analyze customer demographics and top customers by value" 
  },
  { 
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, 
    label: "Revenue trends", q: "Show revenue by category and time periods with trends" 
  },
  { 
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, 
    label: "Sales insights", q: "Analyze sales trends and key performance metrics" 
  },
  { 
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>, 
    label: "Table summary",  q: "Give me a summary of all tables and their row counts" 
  },
  { 
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>, 
    label: "Latest data",    q: "Show me the most recently added or modified records" 
  },
];

const MAX_ATTACHED    = 50;
const FILE_SIZE_LIMIT = 50 * 1024 * 1024;

// ── Dashboard Component ───────────────────────────────────────────────────────
export default function Dashboard() {
  const enableVoice = process.env.NEXT_PUBLIC_ENABLE_VOICE !== "false";
  const { user, loading } = useAuth();
  const router = useRouter();

  // ── AI provider ──────────────────────────────────────────────────────────
  const [provider, setProvider]             = useState("OpenAI");
  const [model, setModel]                   = useState("gpt-4o-mini");
  const [apiKey, setApiKey]                 = useState("");
  const [simThreshold, setSimThreshold]     = useState(0.85);
  const [ollamaModels, setOllamaModels]     = useState<import("@/lib/api").OllamaModel[]>([]);
  const [ollamaFetching, setOllamaFetching] = useState(false);
  const [ollamaError, setOllamaError]       = useState("");

  // ── DB connection ─────────────────────────────────────────────────────────
  const [connected, setConnected]   = useState(false);
  const [database, setDatabase]     = useState("");
  const [server, setServer]         = useState("");
  const [dbName, setDbName]         = useState("");
  const [username, setUsername]     = useState("");
  const [password, setPassword]     = useState("");
  const [winAuth, setWinAuth]       = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError]   = useState("");
  const [stats, setStats]           = useState<DBStats | null>(null);
  const [tables, setTables]         = useState<Table[]>([]);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const [sessions, setSessions]                   = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId]     = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded]         = useState(false);
  const [input, setInput]                         = useState("");
  const [sending, setSending]                     = useState(false);

  // ── Voice ─────────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording]       = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError]         = useState("");
  const [interimText, setInterimText]       = useState(""); 
  const recognitionRef                      = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef                  = useRef<string>("");  
  const voiceStartTimeRef                   = useRef<number>(0);

  // ── File attachments ──────────────────────────────────────────────────────
  const [attachedFiles, setAttachedFiles]       = useState<AttachedFile[]>([]);
  const [uploadingFile, setUploadingFile]       = useState(false);
  const [uploadingLabel, setUploadingLabel]     = useState("");  
  const [sheetPickerOpen, setSheetPickerOpen]   = useState(false);
  const [sheetPickerQueue, setSheetPickerQueue] = useState<SheetPickerQueue>([]);
  const [sheetPickerTotal, setSheetPickerTotal] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── UI panels ─────────────────────────────────────────────────────────────
  const [chatSearchText, setChatSearchText] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [language, setLanguage] = useState("en-US");
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cachePanel, setCachePanel]     = useState(false);
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [filePanelOpen, setFilePanelOpen] = useState(false);
  const [lineagePanel, setLineagePanel]   = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeSession?.messages]);

  // ── Keyboard shortcut: Ctrl+Shift+M ─────────────────────────────
  useEffect(() => {
    if (!enableVoice) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === "KeyM") {
        e.preventDefault();
        if (isRecording) stopRecording();
        else if (connected && !isTranscribing) startRecording();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording, isTranscribing, connected, enableVoice]);

  // ── Ctrl+V paste ────────────────────────────────────────────────
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!connected) return;
      if (e.clipboardData?.getData("text/plain")?.trim()) return;
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) return;
      const previewUrl = URL.createObjectURL(blob);
      const tempId = Date.now();
      setAttachedFiles(prev => [...prev, {
        id: tempId, name: `clipboard_${new Date().toLocaleTimeString()}.png`, type: "png", category: "image_ocr", rowCount: 0, colCount: 0, columns: [], sheetName: null, imagePreviewUrl: previewUrl,
      }]);
      setUploadingFile(true);
      setUploadingLabel("clipboard image");
      try {
        const { uploadClipboardImage } = await import("@/lib/api");
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = ""; bytes.forEach(b => (binary += String.fromCharCode(b)));
        const b64 = btoa(binary);
        const res = await uploadClipboardImage(b64, `clipboard_${Date.now()}.png`);
        setAttachedFiles(prev => prev.map(f =>
          f.id === tempId ? { id: res.file_id, name: res.file_name, type: res.file_type, category: res.category ?? "image_ocr", rowCount: res.row_count, colCount: res.col_count, columns: res.columns, sheetName: null, imagePreviewUrl: previewUrl } : f
        ));
        inputRef.current?.focus();
      } catch {
        setAttachedFiles(prev => prev.filter(f => f.id !== tempId));
        URL.revokeObjectURL(previewUrl);
      } finally { setUploadingFile(false); setUploadingLabel(""); }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [connected]);

  // ── Auto-reconnect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.email || connected) return;
    const saved = localStorage.getItem("sql_analyst_conn");
    if (!saved) return;
    try {
      const conn = JSON.parse(saved);
      if (!conn.server || !conn.database) return;
      import("@/lib/api").then(({ connectDB }) => {
        connectDB(conn).then(res => {
          setServer(conn.server); setDbName(conn.database);
          setUsername(conn.username || ""); setPassword(conn.password || "");
          setWinAuth(conn.windows_auth);
          setConnected(true); setDatabase(res.database); setHistoryLoaded(false);
        }).catch(() => localStorage.removeItem("sql_analyst_conn"));
      });
    } catch { /* ignore */ }
  }, [user?.email, connected]);

  // ── Load chat history & stats ─────────────────────────────────────────────
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

  // ── Ollama model detection ────────────────────────────────────────────────
  useEffect(() => {
    if (provider !== "Ollama") return;
    setOllamaFetching(true); setOllamaError("");
    import("@/lib/api").then(({ fetchOllamaModels }) =>
      fetchOllamaModels()
        .then(res => {
          setOllamaModels(res.models);
          if (res.models.length) setModel(res.models[0].name);
          else setOllamaError("No models found. Run: ollama pull llama3");
        })
        .catch(e => setOllamaError(e instanceof Error ? e.message : "Cannot reach Ollama"))
        .finally(() => setOllamaFetching(false))
    );
  }, [provider]);

  // ── SQL + Fintech grammar fix ─────────────────────────────────────────────
  function applyGrammarFixes(text: string): string {
    const fixes: [RegExp, string][] = [
      [/\bsum of\b/gi, "SUM"], [/\bcount of\b/gi, "COUNT"], [/\bcount star\b/gi, "COUNT(*)"], [/\baverage of\b/gi, "AVG"], [/\bmaximum of\b/gi, "MAX"], [/\bminimum of\b/gi, "MIN"], [/\bgroup bye\b/gi, "GROUP BY"], [/\bgroup by\b/gi, "GROUP BY"], [/\border bye\b/gi, "ORDER BY"], [/\border by\b/gi, "ORDER BY"], [/\bhaving clause\b/gi, "HAVING"], [/\bwhere clause\b/gi, "WHERE"], [/\binner join\b/gi, "INNER JOIN"], [/\bleft join\b/gi, "LEFT JOIN"], [/\bright join\b/gi, "RIGHT JOIN"], [/\bdistinct\b/gi, "DISTINCT"], [/\bgreater than or equal\b/gi, ">="], [/\bless than or equal\b/gi, "<="], [/\bgreater than\b/gi, ">"], [/\bless than\b/gi, "<"], [/\bnot equal\b/gi, "!="], [/\bis null\b/gi, "IS NULL"], [/\bis not null\b/gi, "IS NOT NULL"],
      [/\bone crore\b/gi, "10000000"], [/\bten lakh[s]?\b/gi, "1000000"], [/\bone lakh\b/gi, "100000"], [/\bfifty thousand\b/gi, "50000"], [/\btwenty.?five thousand\b/gi, "25000"], [/\bten thousand\b/gi, "10000"], [/\bfive thousand\b/gi, "5000"], [/\bone thousand\b/gi, "1000"], [/\bone hundred\b/gi, "100"], [/\bninety\b/gi, "90"], [/\beighty\b/gi, "80"], [/\bseventy\b/gi, "70"], [/\bsixty\b/gi, "60"], [/\bfifty\b/gi, "50"], [/\bforty\b/gi, "40"], [/\bthirty\b/gi, "30"], [/\btwenty\b/gi, "20"], [/\bfifteen\b/gi, "15"], [/\bten\b/gi, "10"], [/\bfive\b/gi, "5"],
      [/\btrans action\b/gi, "transaction"], [/\bcustomer i d\b/gi, "customer_id"], [/\bproduct i d\b/gi, "product_id"], [/\border i d\b/gi, "order_id"], [/\buser i d\b/gi, "user_id"], [/\btime stamp\b/gi, "timestamp"], [/\bprofit margin\b/gi, "profit_margin"], [/\bsales amount\b/gi, "sales_amount"], [/\bcredit score\b/gi, "credit_score"], [/\s{2,}/g, " "],
    ];
    let result = text;
    for (const [pattern, replacement] of fixes) result = result.replace(pattern, replacement);
    return result.trim();
  }

  // ── Voice recording ───────────────────────────────────────────────────────
  const startRecording = () => {
    setVoiceError(""); setInterimText(""); finalTranscriptRef.current = "";
    // @ts-ignore
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) { setVoiceError("Live voice not supported in this browser."); return; }
    const recognition: SpeechRecognition = new SpeechRecognitionAPI();
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = language; recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    recognition.onstart = () => { setIsRecording(true); voiceStartTimeRef.current = Date.now(); };
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscriptRef.current += applyGrammarFixes(transcript) + " ";
        else interim = transcript;
      }
      setInterimText(interim);
      setInput((finalTranscriptRef.current + interim).trimStart());
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return;
      setVoiceError(`Voice error: ${event.error}`); setIsRecording(false); setInterimText("");
    };
    recognition.onend = () => {
      setIsRecording(false); setInterimText("");
      const finalText = applyGrammarFixes(finalTranscriptRef.current);
      if (finalText) {
        setInput(finalText);
        import("@/lib/api").then(({ logVoiceTranscript }) => { logVoiceTranscript({ raw_text: finalTranscriptRef.current.trim(), clean_text: finalText, latency_ms: Date.now() - voiceStartTimeRef.current, language: language, lang_prob: 1.0 }).catch(() => {}); });
      }
    };
    recognition.start();
  };
  const stopRecording = () => { recognitionRef.current?.stop(); };

  // ── New session & Send Message ────────────────────────────────────────────
  async function newSession() {
    try {
      const { createSession } = await import("@/lib/api");
      const { session_id } = await createSession();
      const s: Session = { id: String(session_id), dbId: session_id, title: "New chat", createdAt: new Date().toISOString(), messages: [] };
      setSessions(prev => [s, ...prev]); setActiveSessionId(s.id); setInput("");
    } catch {
      const s: Session = { id: uid(), title: "New chat", createdAt: new Date().toISOString(), messages: [] };
      setSessions(prev => [s, ...prev]); setActiveSessionId(s.id); setInput("");
    }
  }

  const sendMessage = useCallback(async (text: string, cutoffMsgId?: string) => {
    const q = text.trim();
    if (!q || sending) return;
    if (!connected) { alert("Connect to a database first."); return; }
    if (!apiKey && provider !== "Ollama") { alert("Enter an API key first."); return; }

    let sid = activeSessionId; let dbSessionId: number | undefined;
    if (!sid) {
      try {
        const { createSession } = await import("@/lib/api");
        const { session_id } = await createSession();
        dbSessionId = session_id;
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
      const rawMsg = e instanceof Error ? e.message : "Query failed";
      const errInfo = { ...parseQueryError(rawMsg), question: q };
      const errMsg: Message = { id: loadMsg.id, role: "assistant", content: "I encountered an error running that query.", errorInfo: errInfo };
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, messages: s.messages.map(m => m.id === loadMsg.id ? errMsg : m) } : s));
    } finally { setSending(false); }
  }, [activeSessionId, connected, apiKey, provider, model, simThreshold, sending, sessions]);

  // ── File analysis ─────────────────────────────────────────────────────────
  async function handleFileAnalysis(prompt: string, cutoffMsgId?: string, overrideFiles?: AttachedFile[]) {
    const filesToUse = overrideFiles || attachedFiles;
    if (filesToUse.length === 0 || !prompt.trim()) return;
    if (!apiKey && provider !== "Ollama") { alert("Enter an API key first."); return; }
    const q = prompt.trim(); const qLower = q.toLowerCase();
    let targetFiles = filesToUse;
    if (filesToUse.length > 1) {
      const compareKeywords = ["compare", "comparison", "vs "];
      const wantsCompare = compareKeywords.some(k => qLower.includes(k));
      if (!wantsCompare) {
        const matched = attachedFiles.filter(f => {
          const baseName = f.name.replace(/\.[^.]+$/, "").toLowerCase();
          return qLower.includes(baseName);
        });
        targetFiles = matched.length >= 1 ? matched : filesToUse;
      }
    }
    const isCompare = targetFiles.length > 1;

    let sid = activeSessionId; let dbSessionId: number | undefined;
    if (!sid) {
      try {
        const { createSession } = await import("@/lib/api");
        const { session_id } = await createSession();
        dbSessionId = session_id;
        const s: Session = { id: String(session_id), dbId: session_id, title: truncate(q, 32), createdAt: new Date().toISOString(), messages: [] };
        setSessions(prev => [s, ...prev]); setActiveSessionId(s.id); sid = s.id;
      } catch {
        const s: Session = { id: uid(), title: truncate(q, 32), createdAt: new Date().toISOString(), messages: [] };
        setSessions(prev => [s, ...prev]); setActiveSessionId(s.id); sid = s.id;
      }
    } else { dbSessionId = sessions.find(s => s.id === sid)?.dbId; }

    const fileLabels = filesToUse.map(f => `📎 ${f.name}`).join("\n");
    const userMsg: Message = { id: uid(), role: "user", content: `${fileLabels}\n${q}`, attachedFiles: filesToUse, rawPrompt: q };
    const loadMsg: Message = { id: uid(), role: "assistant", content: "", loading: true };
    setSessions(prev => prev.map(s => {
      if (s.id !== sid) return s;
      const msgs = cutoffMsgId ? s.messages.slice(0, s.messages.findIndex(m => m.id === cutoffMsgId)) : s.messages;
      return { ...s, title: msgs.length === 0 ? truncate(q, 32) : s.title, messages: [...msgs, userMsg, loadMsg] };
    }));
    if (!overrideFiles) setInput(""); 
    setSending(true);

    try {
      let analysisText = ""; let cached = false; let summaryText = ""; let chartCols: string[] = []; let chartRows: unknown[][] = [];
      let execMs = 0; let cacheMs = 0;
      if (isCompare) {
        const { compareFiles } = await import("@/lib/api");
        const result = await compareFiles({ file_ids: targetFiles.map(f => f.id), prompt: q, provider, model, api_key: provider !== "Ollama" ? apiKey : undefined, base_url: "http://localhost:11434", session_id: dbSessionId });
        analysisText = result.analysis; cached = result.cached; execMs = result.execution_time_ms ?? 0; cacheMs = result.cache_ms ?? 0;
        const labels = targetFiles.map(f => f.name).join(", ");
        summaryText = `${cached ? "⚡ Cached · " : ""}Compared ${result.file_count} file(s) — ${labels}`;
        chartCols = result.chart_data?.columns ?? []; chartRows = result.chart_data?.rows ?? [];
      } else {
        const { analyzeFile } = await import("@/lib/api");
        const result = await analyzeFile({ file_id: targetFiles[0].id, prompt: q, provider, model, api_key: provider !== "Ollama" ? apiKey : undefined, base_url: "http://localhost:11434", session_id: dbSessionId });
        analysisText = result.analysis; cached = result.cached; execMs = result.execution_time_ms ?? 0; cacheMs = result.cache_ms ?? 0;
        chartCols = result.chart_data?.columns ?? []; chartRows = result.chart_data?.rows ?? [];
        summaryText = `${cached ? "⚡ Cached · " : ""}Analysed ${targetFiles[0].name}`;
      }
      const assistantMsg: Message = { id: loadMsg.id, role: "assistant", content: summaryText, result: { question: q, sql_query: "", analysis: analysisText, columns: chartCols, rows: chartRows, row_count: chartRows.length, source: cached ? "cache" : "model", timing: cached ? { cache_ms: cacheMs, first_exec_ms: execMs, match_type: "exact", similarity: 1.0, model_ms: execMs } : { model_ms: execMs }, asked_at: new Date().toISOString(), completed_at: new Date().toISOString() } };
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, messages: s.messages.map(m => m.id === loadMsg.id ? assistantMsg : m) } : s));
    } catch (e: unknown) {
      const rawMsg = e instanceof Error ? e.message : "Analysis failed";
      const { parseQueryError } = await import("@/components/chat/ErrorCard");
      const errMsg: Message = { id: loadMsg.id, role: "assistant", content: "I encountered an error analysing that file.", errorInfo: { ...parseQueryError(rawMsg), question: q } };
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, messages: s.messages.map(m => m.id === loadMsg.id ? errMsg : m) } : s));
    } finally { setSending(false); }
  }

  async function handleConnect() {
    if (!server || !dbName) { setConnError("Server and database required."); return; }
    setConnecting(true); setConnError("");
    try {
      const { connectDB } = await import("@/lib/api");
      const res = await connectDB({ server, database: dbName, username: winAuth ? undefined : username, password: winAuth ? undefined : password, windows_auth: winAuth });
      setConnected(true); setDatabase(res.database); setSettingsOpen(false); setHistoryLoaded(false);
      localStorage.setItem("sql_analyst_conn", JSON.stringify({ server, database: dbName, username: winAuth ? "" : username, password: winAuth ? "" : password, windows_auth: winAuth }));
    } catch (e: unknown) { setConnError(e instanceof Error ? e.message : "Connection failed"); }
    finally { setConnecting(false); }
  }
  function handleLogout() { logout(); router.push("/login"); }

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#64748b", fontSize: 14 }}>Loading…</div>;
  if (!user) return null;

  const roleBg:    Record<string, string> = { Admin: "#e0e7ff", Analyst: "#dcfce7", Viewer: "#fef3c7" };
  const roleColor: Record<string, string> = { Admin: "#1e40af", Analyst: "#166534", Viewer: "#92400e" };
  const filteredSessions = chatSearchText ? sessions.filter(s => s.title.toLowerCase().includes(chatSearchText.toLowerCase())) : sessions;
  const grouped: Record<string, Session[]> = {};
  filteredSessions.forEach(s => { const k = fmtDate(s.createdAt); grouped[k] = [...(grouped[k] ?? []), s]; });

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", background: "#f8fafc", overflow: "hidden" }}>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
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

      {/* ══════════ STANDARDIZED WHITE SIDEBAR ══════════ */}
      <aside style={{ 
        width: sidebarOpen ? 260 : 0, minWidth: sidebarOpen ? 260 : 0, 
        background: "#ffffff", borderRight: "1px solid #e5e7eb", 
        display: "flex", flexDirection: "column", 
        transition: "width 0.25s ease, min-width 0.25s ease", 
        overflow: "hidden", flexShrink: 0, position: "relative" 
      }}>
        
        {/* Floating Collapse Button on border */}
        {/* Floating Collapse Button on border */}
        <button id="toggleMenuBtn" onClick={() => setSidebarOpen(false)} title="Collapse sidebar" style={{ 
          position: "absolute", right: -14, top: 84, background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", color: "#475569", cursor: "pointer", zIndex: 50 
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        <div style={{ width: 260, display: "flex", flexDirection: "column", height: "100%" }}>
          {/* Logo Area + '+' New Chat Button */}
          <div style={{ padding: "0 16px", borderBottom: "1px solid #e5e7eb", height: "72px", display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: "20px" }}>
            <img src="/QFT-image.png" alt="Quinte Logo" style={{ height: "60px", objectFit: "contain" }} />
            <button onClick={newSession} title="New chat" style={{
              width: 32, height: 32, borderRadius: 8,
              background: "#f1f5f9", border: "1px solid #e2e8f0",
              color: "#0f172a", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", transition: "all 0.15s"
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#e2e8f0"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f1f5f9"; }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          </div>

          {/* Connection status & Search */}
          <div style={{ padding: "16px 16px 10px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {connected ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#15803d", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 12px" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />{database}
                {stats && <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 11 }}>{stats.table_count} tables</span>}
              </div>
            ) : (
              <button onClick={() => setSettingsOpen(true)} style={{ width: "100%", padding: "8px 12px", fontSize: 12, borderRadius: 6, border: "1px dashed #cbd5e1", background: "#f8fafc", color: "#64748b", cursor: "pointer", fontFamily: "inherit", textAlign: "center", fontWeight: 500 }}>+ Connect Database</button>
            )}
            
            <input 
              type="text" placeholder="Search chats..." value={chatSearchText} onChange={e => setChatSearchText(e.target.value)} 
              style={{ width: "100%", padding: "8px 12px", fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#0f172a", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} 
            />
          </div>

          {/* Session list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
            {filteredSessions.length === 0 ? (
              <div style={{ padding: "20px 8px", fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.6 }}>No chats yet.<br />Ask a question to start.</div>
            ) : (
              Object.entries(grouped).map(([date, grp]) => (
                <div key={date} style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.05em", textTransform: "uppercase", padding: "0 8px 6px", fontWeight: 600 }}>{date}</div>
                  {grp.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 4 }}>
                      <button onClick={async () => {
                        setActiveSessionId(s.id);
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
                          } catch { /* ignore */ }
                        }
                      }} style={{ flex: 1, textAlign: "left", padding: "8px 12px", borderRadius: 6, background: s.id === activeSessionId ? "#f1f5f9" : "transparent", color: s.id === activeSessionId ? "#0f172a" : "#64748b", fontSize: 13, fontWeight: s.id === activeSessionId ? 600 : 400, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10, overflow: "hidden", border: "none" }}>
                        <svg className="flex-shrink-0" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                        {renamingSessionId === s.id ? (
                          <input autoFocus value={renameText} onChange={e => setRenameText(e.target.value)} onClick={e => e.stopPropagation()}
                            onKeyDown={async e => {
                              if (e.key === "Enter" && s.dbId) {
                                try { const { renameSession } = await import("@/lib/api"); await renameSession(s.dbId, renameText); setSessions(prev => prev.map(x => x.id === s.id ? { ...x, title: renameText } : x)); } catch {}
                                setRenamingSessionId(null);
                              } else if (e.key === "Escape") { setRenamingSessionId(null); }
                            }}
                            onBlur={() => setRenamingSessionId(null)}
                            style={{ flex: 1, background: "#fff", border: "1px solid #cbd5e1", color: "#0f172a", fontSize: 12, outline: "none", fontFamily: "inherit", padding: "2px 6px", borderRadius: 4 }} 
                          />
                        ) : (
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                        )}
                      </button>
                      
                      {/* Edit/Delete Actions */}
                      {renamingSessionId !== s.id && (
                        <button onClick={(e) => { e.stopPropagation(); setRenameText(s.title); setRenamingSessionId(s.id); }} title="Rename chat" style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 5, background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: s.id === activeSessionId ? 1 : 0 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </button>
                      )}
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        if (s.dbId) { try { const { deleteSessionById } = await import("@/lib/api"); await deleteSessionById(s.dbId); } catch { /* ignore */ } }
                        setSessions(prev => prev.filter(x => x.id !== s.id));
                        if (activeSessionId === s.id) setActiveSessionId(null);
                      }} title="Delete chat" style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 5, background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: s.id === activeSessionId ? 1 : 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Sidebar footer */}
          <div style={{ borderTop: "1px solid #e5e7eb", padding: "16px", background: "#f8fafc" }}>
            {stats && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[{ label: "Tables", value: stats.table_count }, { label: "Cached", value: stats.cached_queries }, { label: "Records", value: stats.total_rows > 999 ? `${(stats.total_rows / 1000).toFixed(0)}k` : stats.total_rows }, { label: "Hits", value: stats.total_hits }].map(m => (
                  <div key={m.label} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px" }}>
                    <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{m.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{m.value}</div>
                  </div>
                ))}
              </div>
            )}
            
            <button onClick={() => setSettingsOpen(v => !v)} style={{ width: "100%", padding: "10px", borderRadius: 6, marginBottom: 12, background: settingsOpen ? "#e2e8f0" : "#ffffff", border: "1px solid #cbd5e1", color: "#475569", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
              Settings &amp; Connection
            </button>
            
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#475569", flexShrink: 0 }}>
                 <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.display_name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{user.role}</div>
              </div>
              <button onClick={handleLogout} title="Sign out" style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ══════════ MAIN CONTENT AREA ══════════ */}
      <div style={{ flex: 1, display: "flex", minWidth: 0, backgroundColor: "#ffffff" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>

          {/* Top bar */}
          <div style={{ height: 60, background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 24px", gap: 12, flexShrink: 0 }}>
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 6, borderRadius: 6, display: "flex" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
              </button>
            )}
            <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{activeSession ? truncate(activeSession.title, 50) : "SQL Analyst Workspace"}</div>
            
            {connected && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setLineagePanel(v => !v); setCachePanel(false); }} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: 13, fontWeight: 500, padding: "6px 14px", borderRadius: 6, border: "1px solid #e2e8f0", background: lineagePanel ? "#f1f5f9" : "#fff", color: lineagePanel ? "#0f172a" : "#475569", cursor: "pointer", fontFamily: "inherit" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                  Lineage
                </button>
                <button onClick={() => { setCachePanel(v => !v); setLineagePanel(false); if (!cachePanel) import("@/lib/api").then(({ fetchCache }) => fetchCache().then(r => setCacheEntries(r.entries as CacheEntry[]))); }} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: 13, fontWeight: 500, padding: "6px 14px", borderRadius: 6, border: "1px solid #e2e8f0", background: cachePanel ? "#f1f5f9" : "#fff", color: cachePanel ? "#0f172a" : "#475569", cursor: "pointer", fontFamily: "inherit" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                  Cache
                </button>
                {activeSession && <button onClick={newSession} style={{ fontSize: 13, fontWeight: 500, padding: "6px 14px", borderRadius: 6, border: "none", background: "#111827", color: "#ffffff", cursor: "pointer", fontFamily: "inherit" }}>+ New chat</button>}
              </div>
            )}
          </div>

          {/* Settings panel Overlay */}
          {settingsOpen && (
            <div style={{ position: "absolute", top: 60, left: 0, right: 0, zIndex: 30, background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "24px 32px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>AI Provider</div>
                <select value={provider} onChange={e => { const p = e.target.value; setProvider(p); if (p === "OpenAI") setModel("gpt-4o-mini"); if (p === "Gemini") setModel("gemini-1.5-flash"); if (p === "Ollama") setModel(""); }} style={{ width: "100%", height: 38, borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 10px", marginBottom: 10, color: "#0f172a", outline: "none", fontFamily: "inherit" }}>
                  <option>OpenAI</option><option>Gemini</option><option>Ollama</option>
                </select>
                
                {provider !== "Ollama" && (
                  <>
                    <input type="password" placeholder={provider === "OpenAI" ? "sk-..." : "AIza..."} value={apiKey} onChange={e => setApiKey(e.target.value)} style={{ width: "100%", height: 38, borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 12px", fontFamily: "inherit", marginBottom: 10, color: "#0f172a", outline: "none", boxSizing: "border-box" }} />
                    <select value={model} onChange={e => setModel(e.target.value)} style={{ width: "100%", height: 38, borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 10px", color: "#0f172a", outline: "none", fontFamily: "inherit" }}>
                      {provider === "OpenAI" ? ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"].map(m => <option key={m}>{m}</option>) : ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </>
                )}

                {/* Full Ollama Lifecycle Integration */}
                {provider === "Ollama" && (
                  <div style={{ marginTop: 2 }}>
                    {ollamaFetching ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f8fafc", borderRadius: 6, border: "1px solid #cbd5e1", color: "#64748b", fontSize: 13 }}>
                        <div style={{ width: 14, height: 14, border: "2px solid #cbd5e1", borderTopColor: "#111827", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
                        <span>Detecting Ollama models…</span>
                      </div>
                    ) : ollamaError ? (
                      <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #f87171", borderRadius: 6, fontSize: 13, color: "#991b1b" }}>
                        <div style={{ marginBottom: 4 }}>{ollamaError}</div>
                        <button onClick={() => {
                          setOllamaFetching(true); setOllamaError("");
                          import("@/lib/api").then(({ fetchOllamaModels }) => fetchOllamaModels().then(r => { setOllamaModels(r.models); if (r.models.length) setModel(r.models[0].name); else setOllamaError("No models found."); }).catch(e => setOllamaError(e instanceof Error ? e.message : "Error")).finally(() => setOllamaFetching(false)));
                        }} style={{ fontSize: 12, color: "#111827", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Retry</button>
                      </div>
                    ) : ollamaModels.length === 0 ? (
                      <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, fontSize: 13, color: "#92400e" }}>
                        No models found. Make sure Ollama is running.
                      </div>
                    ) : (
                      <>
                        <select value={model} onChange={e => setModel(e.target.value)} style={{ width: "100%", height: 38, borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 10px", color: "#0f172a", outline: "none", fontFamily: "inherit", marginBottom: 8 }}>
                          {ollamaModels.map(m => (
                            <option key={m.name} value={m.name}>{m.name}{m.size_gb > 0 ? ` (${m.size_gb} GB)` : ""}</option>
                          ))}
                        </select>
                        <button onClick={() => {
                          setOllamaFetching(true); setOllamaError("");
                          import("@/lib/api").then(({ fetchOllamaModels }) => fetchOllamaModels().then(r => { setOllamaModels(r.models); if (r.models.length) setModel(r.models[0].name); }).catch(e => setOllamaError(e instanceof Error ? e.message : "Error")).finally(() => setOllamaFetching(false)));
                        }} style={{ fontSize: 12, color: "#475569", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
                          ↻ Refresh models
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>SQL Server {connected && <span style={{ color: "#16a34a", marginLeft: 6, textTransform: "none" }}>✓ {database}</span>}</div>
                <input placeholder="Server" value={server} onChange={e => setServer(e.target.value)} style={{ width: "100%", height: 38, borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 12px", fontFamily: "inherit", marginBottom: 10, color: "#0f172a", outline: "none", boxSizing: "border-box" }} />
                <input placeholder="Database name" value={dbName} onChange={e => setDbName(e.target.value)} style={{ width: "100%", height: 38, borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 14, padding: "0 12px", fontFamily: "inherit", marginBottom: 12, color: "#0f172a", outline: "none", boxSizing: "border-box" }} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569", marginBottom: 10, cursor: "pointer" }}><input type="checkbox" checked={winAuth} onChange={e => setWinAuth(e.target.checked)} style={{ accentColor: "#111827", width: 16, height: 16 }} />Windows authentication</label>
                {!winAuth && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} style={{ height: 36, borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 13, padding: "0 10px", color: "#0f172a", outline: "none", fontFamily: "inherit" }} />
                  <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ height: 36, borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: 13, padding: "0 10px", color: "#0f172a", outline: "none", fontFamily: "inherit" }} />
                </div>}
                {connError && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>{connError}</div>}
                <button onClick={handleConnect} disabled={connecting} style={{ width: "100%", height: 38, borderRadius: 6, background: "#111827", color: "#ffffff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 0.2s" }}>{connecting ? "Connecting…" : connected ? "Reconnect" : "Connect"}</button>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Semantic Cache</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, color: "#475569" }}>Similarity threshold</span><span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{simThreshold.toFixed(2)}</span></div>
                <input type="range" min={0.70} max={1.00} step={0.01} value={simThreshold} onChange={e => setSimThreshold(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#111827", marginBottom: 6 }} />
                <div style={{ fontSize: 12, color: "#64748b" }}>{simThreshold >= 0.95 ? "🔴 Very strict" : simThreshold >= 0.85 ? "🟡 Balanced" : "🟢 Aggressive"}</div>
                {tables.length > 0 && <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Tables ({tables.length})</div>
                  <div style={{ maxHeight: 100, overflowY: "auto", fontSize: 12, color: "#475569" }}>
                    {tables.map(t => <div key={t.full_name} style={{ padding: "3px 0", display: "flex", justifyContent: "space-between" }}><span>{t.full_name}</span><span style={{ color: "#94a3b8" }}>{t.row_count.toLocaleString()}</span></div>)}
                  </div>
                </div>}
              </div>
            </div>
          )}

          {/* Chat messages Area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "32px 0", backgroundColor: "#f8fafc" }}>
            <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 32px" }}>

              {/* Empty state */}
              {(!activeSession || activeSession.messages.length === 0) && (
                <div style={{ textAlign: "center", paddingTop: 80 }}>
                  <div style={{ width: 64, height: 64, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
                      <circle cx="17.5" cy="17.5" r="3.5" /><line x1="17.5" y1="15.5" x2="17.5" y2="19.5" /><line x1="15.5" y1="17.5" x2="19.5" y2="17.5" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>{connected ? `Connected to ${database}` : "Welcome to SQL Analyst"}</div>
                  <div style={{ fontSize: 15, color: "#64748b", marginBottom: 40, lineHeight: 1.6 }}>{connected ? "Ask any question about your data in plain English, or attach a CSV / Excel file" : "Connect to your SQL Server database to get started"}</div>
                  {!connected && <button onClick={() => setSettingsOpen(true)} style={{ padding: "12px 28px", borderRadius: 8, background: "#111827", color: "#ffffff", border: "none", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Connect database</button>}
                  
                  {/* Quick Prompts */}
                  {connected && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 680, margin: "0 auto" }}>
                      {QUICK_PROMPTS.map(p => (
                        <button key={p.q} onClick={() => sendMessage(p.q)} style={{ padding: "16px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#ffffff", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#cbd5e1"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 2px rgba(0,0,0,0.02)"; }}>
                          <div style={{ color: "#0f172a", marginBottom: 8 }}>{p.icon}</div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>{p.label}</div>
                          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>{truncate(p.q, 44)}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Messages Iteration */}
              {activeSession?.messages.map((msg) => (
                <MessageBubble 
                  key={msg.id} msg={msg} onEdit={(text) => setInput(text)} 
                  onRetry={(text) => { if (msg.attachedFiles && msg.attachedFiles.length > 0) { handleFileAnalysis(msg.rawPrompt || text.replace(/^📎 .*\n/gm, ''), msg.id, msg.attachedFiles); } else { sendMessage(text, msg.id); } }} 
                  onDelete={() => setSessions(prev => prev.map(s => { if (s.id !== activeSessionId) return s; const idx = s.messages.findIndex(m => m.id === msg.id); if (idx === -1) return s; const newMsgs = [...s.messages]; newMsgs.splice(idx, msg.role === "user" ? 2 : 1); return { ...s, messages: newMsgs }; }))}
                />
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input bar */}
          <div style={{ background: "#ffffff", borderTop: "1px solid #e5e7eb", padding: "16px 32px 20px", flexShrink: 0 }}>
            <div style={{ maxWidth: 860, margin: "0 auto" }}>

              {/* Attachments preview area */}
              {(attachedFiles.length > 0 || uploadingFile) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "flex-end" }}>
                  {uploadingFile && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 10, background: "#f8fafc", border: "1px dashed #cbd5e1", fontSize: 11, color: "#64748b" }}>
                      <div style={{ width: 12, height: 12, border: "2px solid #cbd5e1", borderTopColor: "#111827", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
                      Uploading {uploadingLabel || "file"}…
                    </div>
                  )}
                  {attachedFiles.map(f => {
                    const isImage = !!f.imagePreviewUrl; // FIX: Ensure it correctly identifies true images
                    const [displayFile, displaySheet] = f.name.includes(" · ") ? f.name.split(" · ") : [f.name, null];
                    
                    // Corporate minimal SVG icons for files
                    const getFileIcon = (ext: string) => {
                      const t = ext.toLowerCase();
                      if (['csv','tsv','xlsx','xls','json'].includes(t)) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
                      if (['pdf'].includes(t)) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h1a2 2 0 0 0 0-4H9c-.5 0-1 .5-1 1v4c0 .5.5 1 1 1h1"/></svg>;
                      if (['doc','docx','txt','rtf'].includes(t)) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
                      if (['ppt','pptx'].includes(t)) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>;
                      if (['htm','html','edge'].includes(t)) return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
                      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>;
                    };

                    if (isImage) {
                      return (
                        <div key={f.id} style={{ position: "relative", flexShrink: 0 }}>
                          <img src={f.imagePreviewUrl} alt={f.name} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, border: "1.5px solid #cbd5e1", display: "block", backgroundColor: "#fff" }} />
                          <button onClick={() => { setAttachedFiles(prev => prev.filter(x => x.id !== f.id)); if (f.imagePreviewUrl) URL.revokeObjectURL(f.imagePreviewUrl); }} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#0f172a", border: "2px solid #fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", padding: 0 }}>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#f1f5f9", borderRadius: 8, border: "1px solid #e2e8f0", maxWidth: 240 }}>
                        <div style={{ display: "flex", alignItems: "center", color: "#475569" }}>{getFileIcon(f.type)}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayFile}</div>
                          {displaySheet && <div style={{ fontSize: 10, color: "#64748b" }}>{displaySheet}</div>}
                        </div>
                        <button onClick={() => setAttachedFiles(prev => prev.filter(x => x.id !== f.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 1 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Clean Light Theme Input box */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 16, padding: "10px 14px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)", transition: "border-color 0.2s" }} onClick={() => inputRef.current?.focus()}>
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

                <button onClick={() => fileInputRef.current?.click()} disabled={!connected || uploadingFile} title="Attach file"
                  style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: "none", background: "#f1f5f9", cursor: connected ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", transition: "background 0.2s" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                </button>

                {/* Voice button & Language Dropdown */}
                {enableVoice && (
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
                    <select 
                      value={language}
                      onChange={e => setLanguage(e.target.value)}
                      title="Select voice language"
                      style={{ background: "transparent", border: "none", color: "#64748b", fontSize: 13, fontWeight: 500, cursor: "pointer", outline: "none", padding: "0 4px", fontFamily: "inherit" }}
                    >
                      <option value="en-US">EN</option>
                      <option value="hi-IN">HI</option>
                      <option value="es-ES">ES</option>
                      <option value="fr-FR">FR</option>
                    </select>
                    
                    <button onClick={isRecording ? stopRecording : startRecording} disabled={!connected || isTranscribing} title={connected ? (isRecording ? "Stop recording — Ctrl+Shift+M" : "Voice query — Ctrl+Shift+M") : "Connect to a database first"}
                      style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: "none", background: isRecording ? "#fef2f2" : "#f1f5f9", cursor: connected ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", color: isRecording ? "#ef4444" : "#64748b", transition: "background 0.2s" }}>
                      {isTranscribing
                        ? <div style={{ width: 14, height: 14, border: "2px solid #cbd5e1", borderTopColor: "#111827", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                        : isRecording
                          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" /></svg>
                      }
                    </button>

                    {/* Live recording badge with pulse dot */}
                    {isRecording && (
                      <div style={{ position: "absolute", top: -38, left: "50%", transform: "translateX(-50%)", background: "#ef4444", color: "#fff", fontSize: 11, padding: "5px 12px", borderRadius: 6, whiteSpace: "nowrap", fontWeight: 600, zIndex: 10, display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(239, 68, 68, 0.25)" }}>
                        <div style={{ width: 6, height: 6, background: "#fff", borderRadius: "50%", animation: "pulse 1s ease-in-out infinite" }} />
                        REC — click to stop
                      </div>
                    )}
                  </div>
                )}

                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!isRecording) { if (attachedFiles.length > 0 && input.trim()) handleFileAnalysis(input.trim()); else sendMessage(input); } } }}
                  placeholder={connected ? "Ask a question, use voice (🎤), or attach a file (📎)…" : "Connect to a database first"}
                  disabled={!connected || sending || uploadingFile} rows={1}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 15, color: "#0f172a", fontFamily: "inherit", lineHeight: 1.5, maxHeight: 160, overflowY: "auto", paddingTop: 6, paddingBottom: 6 }}
                />

                <button onClick={() => { if (attachedFiles.length > 0 && input.trim()) handleFileAnalysis(input.trim()); else sendMessage(input); }}
                  disabled={!input.trim() || sending || !connected}
                  style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: input.trim() && connected && !sending ? "#111827" : "#e2e8f0", border: "none", cursor: input.trim() && connected ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}>
                  {sending ? <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.65s linear infinite" }} /> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>}
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: 12, color: "#94a3b8", marginTop: 12 }}>
                <span>Enter to send</span>
                <span>·</span>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg> 
                  Attach
                </span>
                <span>·</span>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg> 
                  Voice:
                </span>
                <kbd style={{ fontFamily: "monospace", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "#475569", letterSpacing: "0.02em", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>Ctrl+Shift+M</kbd>
                <span>·</span>
                <span>Multi-sheet Excel supported</span>
              </div>
            </div>
          </div>
        </div>

        {/* File Panel */}
        {filePanelOpen && connected && (
          <div style={{ width: 320, borderLeft: "1px solid #e5e7eb", background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
            <FilePanel provider={provider} model={model} apiKey={apiKey} connected={connected} onAnalysis={() => setFilePanelOpen(false)} />
          </div>
        )}

        {/* Data Lineage Drawer */}
        {lineagePanel && (
          <div style={{ width: 380, flexShrink: 0, overflow: "hidden", borderLeft: "1px solid #e5e7eb", background: "#fff", zIndex: 10 }}>
            <DataLineagePanel onClose={() => setLineagePanel(false)} onAttachFile={() => {}} />
          </div>
        )}

        {/* Semantic Cache Drawer */}
        {cachePanel && (
          <div style={{ width: 420, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid #e5e7eb", background: "#f8fafc", zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "#fff", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>🗃️ Semantic Cache ({cacheEntries.length})</div>
              <div style={{ display: "flex", gap: 8 }}>
                {user.role === "Admin" && <button onClick={async () => { await flushCache(); setCacheEntries([]); }} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: "1px solid #f87171", color: "#991b1b", background: "#fef2f2", cursor: "pointer", fontFamily: "inherit" }}>Flush all</button>}
                <button onClick={() => setCachePanel(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4, display: "flex" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              {cacheEntries.length === 0 ? <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginTop: 40 }}>No cached queries yet.</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {cacheEntries.map(e => (
                    <div key={e.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, position: "relative" }}>
                      {user.role === "Admin" && (
                        <button onClick={async () => { await deleteCacheEntry(e.id); setCacheEntries(p => p.filter(x => x.id !== e.id)); }} style={{ position: "absolute", top: 12, right: 12, fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                      )}
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", marginBottom: 12, paddingRight: 20 }}>"{e.user_question}"</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11, color: "#475569" }}>
                        <div style={{ background: "#f1f5f9", padding: "3px 8px", borderRadius: 4 }}>🤖 {e.provider}</div>
                        <div style={{ background: "#e0e7ff", color: "#1e40af", padding: "3px 8px", borderRadius: 4 }}>🎯 {e.hit_count} hits</div>
                        <div style={{ background: "#dcfce7", color: "#166534", padding: "3px 8px", borderRadius: 4 }}>⚡ {e.first_exec_ms?.toFixed(0)} ms</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}