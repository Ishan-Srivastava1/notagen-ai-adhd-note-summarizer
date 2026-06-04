import { useEffect, useMemo, useRef, useState } from "react";
import type { Summary } from "./types";
import { categoryColor, chipClass } from "./colors";

const API = import.meta.env.VITE_API_URL || "http://localhost:8080";

type Note = {
  id: string;
  title: string;
  rawText: string;
  summary?: Summary | null;
  summaryHash?: string | null;
  createdAt: string;
  updatedAt: string;
};

type Tab = "summary" | "todo" | "topics" | "plan";

const TAB_META: { id: Tab; label: string; icon: string; color: string; activeColor: string }[] = [
  { id: "summary", label: "Summary",      icon: "📝", color: "border-violet-200 text-violet-700", activeColor: "bg-violet-600 text-white border-violet-600" },
  { id: "todo",    label: "To-Do",        icon: "✅", color: "border-emerald-200 text-emerald-700", activeColor: "bg-emerald-600 text-white border-emerald-600" },
  { id: "topics",  label: "Focus Topics", icon: "🎯", color: "border-sky-200 text-sky-700",         activeColor: "bg-sky-600 text-white border-sky-600" },
  { id: "plan",    label: "Study Plan",   icon: "📅", color: "border-amber-200 text-amber-700",     activeColor: "bg-amber-500 text-white border-amber-500" },
];

const PRIORITY_STYLE: Record<string, string> = {
  high:   "bg-rose-100 text-rose-800 border-rose-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low:    "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export default function App() {
  const [notes,    setNotes]    = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [text,     setText]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [cached,   setCached]   = useState<boolean | null>(null);
  const [err,      setErr]      = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [checked,   setChecked]   = useState<Set<string>>(new Set());

  const [showCats, setShowCats] = useState<string[]>([
    "concept", "definition", "example", "tip", "warning",
  ]);
  const toggleCat = (c: string) =>
    setShowCats((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError,   setTtsError]   = useState<string | null>(null);
  const [audioUrl,   setAudioUrl]   = useState<string | null>(null);
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const prevAudioUrl = useRef<string | null>(null);

  const fmt = (d: string) => {
    const date = new Date(d + "T12:00:00"); // avoid TZ off-by-one
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const daysUntil = (due: string) => {
    const now  = new Date(); now.setHours(0, 0, 0, 0);
    const then = new Date(due + "T12:00:00");
    return Math.round((then.getTime() - now.getTime()) / 86_400_000);
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/notes`);
        const d = await r.json();
        setNotes(d.notes || []);
        if (d.notes?.[0]) {
          const note = await fetchNote(d.notes[0].id);
          setSelected(note);
          setText(note.rawText ?? "");
        }
      } catch { /* ignore */ }
    })();
  }, []);

  async function fetchNote(id: string) {
    const r = await fetch(`${API}/notes/${id}`);
    if (!r.ok) throw new Error(await r.text());
    const { note } = await r.json();
    return note as Note;
  }

  async function createNote(title: string, rawText: string) {
    const r = await fetch(`${API}/notes`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ title, rawText }),
    });
    if (!r.ok) throw new Error(await r.text());
    const { note } = await r.json();
    return note as Note;
  }

  async function onNewNote() {
    setErr(null);
    const title = prompt("Title for the note?", "Untitled") || "Untitled";
    const raw   = text.trim() || "Empty note";
    try {
      const note = await createNote(title, raw);
      setNotes((prev) => [note, ...prev]);
      setSelected(note);
      setText(note.rawText ?? "");
    } catch (e: any) {
      setErr(e.message || "Failed to create note");
    }
  }

  async function onSelectNote(id: string) {
    setErr(null);
    setAudioUrl(null);
    setTtsError(null);
    try {
      const note = await fetchNote(id);
      setSelected(note);
      setText(note.rawText ?? "");
      setCached(null);
      setChecked(new Set());
    } catch (e: any) {
      setErr(e.message || "Failed to load note");
    }
  }

  async function onSummarize() {
    if (!text.trim()) return;
    setErr(null);
    setLoading(true);
    setCached(null);

    const body: Record<string, unknown> = { text };
    if (selected?.id) body.noteId = selected.id;

    try {
      const r = await fetch(`${API}/summarize?stream=1`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!r.ok || !r.body) throw new Error(await r.text());

      const reader  = r.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.slice("data:".length).trim();

          let event: { type: string; text?: string; summary?: Summary; cached?: boolean; message?: string; attempt?: number };
          try { event = JSON.parse(json); } catch { continue; }

          if (event.type === "error") throw new Error(event.message || "Streaming error");
          if (event.type === "done" && event.summary) {
            setCached(Boolean(event.cached));
            setActiveTab("summary");
            setChecked(new Set());
            if (selected?.id) {
              fetchNote(selected.id).then((note) => setSelected(note)).catch(() => null);
            } else {
              setSelected((prev) =>
                prev ? { ...prev, summary: event.summary ?? null } : prev
              );
            }
          }
        }
      }
    } catch (e: any) {
      setErr(e.message || "Summarization failed");
    } finally {
      setLoading(false);
    }
  }

  function buildTTSText(s: Summary): string {
    const parts: string[] = [];
    if (s.bullets?.length)    parts.push(s.bullets.map((b) => b.text).join(". "));
    if (s.highlights?.length) parts.push(s.highlights.map((h) => h.text).join(". "));
    if (s.actions?.length)    parts.push(s.actions.map((a) => a.label).join(". "));
    return parts.join(". ").slice(0, 2_900);
  }

  async function onListen() {
    if (!summary) return;
    setTtsError(null);
    setTtsLoading(true);
    if (prevAudioUrl.current) { URL.revokeObjectURL(prevAudioUrl.current); prevAudioUrl.current = null; }
    try {
      const r = await fetch(`${API}/tts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text: buildTTSText(summary), voice: "Joanna" }),
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      prevAudioUrl.current = url;
      setAudioUrl(url);
      if (audioRef.current) { audioRef.current.src = url; audioRef.current.play(); }
    } catch (e: any) {
      setTtsError(e.message || "TTS failed");
    } finally {
      setTtsLoading(false);
    }
  }

  const summary: Summary | null = useMemo(
    () => (selected?.summary ?? null) as Summary | null,
    [selected]
  );

  const todoItems = useMemo(() => {
    const out: { key: string; label: string; type: "deadline" | "action"; due?: string; priority?: string }[] = [];
    (summary?.deadlines ?? []).forEach((d, i) =>
      out.push({ key: `dl-${i}`, label: d.label, type: "deadline", due: d.due })
    );
    (summary?.actions ?? []).forEach((a, i) =>
      out.push({ key: `ac-${i}`, label: a.label, type: "action", priority: a.priority })
    );
    return out;
  }, [summary]);

  const completedCount = todoItems.filter((t) => checked.has(t.key)).length;

  function toggleCheck(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-violet-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🧠</span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-indigo-700">NotaGen</h1>
              <p className="text-xs text-gray-500">ADHD-friendly note summarizer</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cached !== null && (
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${cached ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>
                {cached ? "⚡ cached" : "✨ fresh"}
              </span>
            )}
            <button
              onClick={onNewNote}
              className="px-4 py-2 text-sm rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-medium shadow-sm"
            >
              + New note
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 grid md:grid-cols-[260px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="bg-white rounded-2xl border shadow-sm p-4">
            <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">My Notes</h2>
            <ul className="space-y-1 max-h-[50vh] overflow-auto pr-1">
              {notes.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => onSelectNote(n.id)}
                    className={[
                      "w-full text-left px-3 py-2.5 rounded-xl transition-colors",
                      selected?.id === n.id
                        ? "bg-indigo-50 border border-indigo-200 text-indigo-700 font-medium"
                        : "hover:bg-gray-50 border border-transparent",
                    ].join(" ")}
                  >
                    <div className="truncate text-sm">{n.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(n.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                </li>
              ))}
              {notes.length === 0 && (
                <li className="text-sm text-gray-400 px-2">No notes yet</li>
              )}
            </ul>
          </div>

          {/* Quick stats */}
          {summary && (
            <div className="bg-white rounded-2xl border shadow-sm p-4 space-y-2">
              <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">At a glance</h2>
              <StatRow icon="📌" label="Key points"   value={summary.bullets?.length ?? 0}    color="text-violet-600" />
              <StatRow icon="💡" label="Highlights"   value={summary.highlights?.length ?? 0} color="text-sky-600" />
              <StatRow icon="📆" label="Deadlines"    value={summary.deadlines?.length ?? 0}  color="text-orange-600" />
              <StatRow icon="✅" label="Actions"      value={summary.actions?.length ?? 0}    color="text-emerald-600" />
              <StatRow icon="🎯" label="Focus topics" value={summary.topics?.length ?? 0}     color="text-rose-600" />
              <StatRow icon="📅" label="Study days"   value={summary.studyPlan?.length ?? 0}  color="text-amber-600" />
            </div>
          )}
        </aside>

        {/* Main panel */}
        <section className="space-y-4">
          {/* Error banner */}
          {err && (
            <div className="p-4 rounded-2xl bg-rose-50 text-rose-800 border border-rose-200 flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <div className="font-medium">
                  {/quota|retry attempt/i.test(err) ? "API quota exhausted" : "Something went wrong"}
                </div>
                <div className="text-sm mt-0.5">{err}</div>
                {/quota|retry attempt/i.test(err) && (
                  <div className="text-sm mt-2 text-rose-700">
                    The free Gemini tier resets daily (midnight Pacific). Try again later, or add a paid key to your <code className="bg-rose-100 px-1 rounded">.env</code>.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Note editor */}
          <div className="bg-white rounded-2xl border shadow-sm p-5">
            <label className="block text-sm font-semibold text-gray-600 mb-2">📄 Your Notes</label>
            <textarea
              className="w-full h-36 p-3 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-gray-50"
              placeholder="Paste or type your notes here… the longer the better!"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <button
                onClick={onSummarize}
                disabled={loading || text.trim().length < 10}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Summarizing…
                  </>
                ) : (
                  <>🧠 Summarize</>
                )}
              </button>
              <button
                onClick={() => selected && setText(selected.rawText || "")}
                className="px-4 py-2.5 rounded-xl border text-sm hover:bg-gray-50 font-medium"
              >
                Reset text
              </button>
              {text.length > 0 && (
                <span className="text-xs text-gray-400 ml-auto">{text.length} chars</span>
              )}
            </div>
          </div>

          {/* Summary area */}
          {(summary || loading) && (
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b bg-gray-50 overflow-x-auto">
                {TAB_META.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                      activeTab === tab.id
                        ? "border-indigo-500 text-indigo-700 bg-white"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
                    ].join(" ")}
                  >
                    {tab.icon} {tab.label}
                    {tab.id === "todo" && todoItems.length > 0 && (
                      <span className="ml-1 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200">
                        {completedCount}/{todoItems.length}
                      </span>
                    )}
                  </button>
                ))}
                {summary && (
                  <button
                    onClick={onListen}
                    disabled={ttsLoading}
                    className="ml-auto px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                    title="Listen via AWS Polly"
                  >
                    {ttsLoading ? (
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                    ) : "🔊"}
                    Listen
                  </button>
                )}
              </div>

              {ttsError && (
                <div className="px-5 pt-3 text-sm text-rose-600">{ttsError}</div>
              )}
              {audioUrl && (
                <div className="px-5 pt-3">
                  <audio ref={audioRef} controls src={audioUrl} className="w-full rounded-xl" />
                </div>
              )}

              {loading && (
                <div className="p-6 space-y-3">
                  <div className="animate-pulse h-4 rounded bg-slate-100 w-3/4" />
                  <div className="animate-pulse h-4 rounded bg-slate-100 w-1/2" />
                  <div className="animate-pulse h-4 rounded bg-slate-100 w-2/3" />
                </div>
              )}

              {summary && (
                <div className="p-5">
                  {/* ── SUMMARY TAB ── */}
                  {activeTab === "summary" && (
                    <div className="space-y-5">
                      {/* Bullet filter chips */}
                      <div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {["concept","definition","example","tip","warning"].map((c) => {
                            const color = categoryColor(c);
                            return (
                              <button
                                key={c}
                                onClick={() => toggleCat(c)}
                                className={[chipClass(color), "transition-opacity", showCats.includes(c) ? "" : "opacity-30"].join(" ")}
                              >
                                {c}
                              </button>
                            );
                          })}
                          <span className="text-xs text-gray-400 self-center ml-1">click to filter</span>
                        </div>

                        <div className="space-y-2">
                          {(summary.bullets ?? [])
                            .filter((b) => showCats.includes(b.category))
                            .map((b, i) => {
                              const color = categoryColor(b.category);
                              return (
                                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl bg-gray-50 border-l-4 border-${color}-400`}>
                                  <span className={chipClass(color)}>{b.category}</span>
                                  <span className="text-sm flex-1">{b.text}</span>
                                </div>
                              );
                            })}
                          {(summary.bullets ?? []).filter((b) => showCats.includes(b.category)).length === 0 && (
                            <p className="text-sm text-gray-400">No bullets for selected filters</p>
                          )}
                        </div>
                      </div>

                      {/* Highlights */}
                      {(summary.highlights ?? []).length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">💡 Key Highlights</h3>
                          <div className="space-y-2">
                            {(summary.highlights ?? []).map((h, i) => {
                              const color = categoryColor(h.category);
                              return (
                                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl bg-slate-50 border-l-4 border-${color}-400`}>
                                  <span className={chipClass(color)}>{h.category}</span>
                                  <span className="text-sm flex-1">{h.text}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── TO-DO TAB ── */}
                  {activeTab === "todo" && (
                    <div className="space-y-5">
                      {/* Progress bar */}
                      {todoItems.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between text-sm mb-1.5">
                            <span className="font-medium text-gray-600">Progress</span>
                            <span className="text-emerald-600 font-bold">{completedCount}/{todoItems.length} done</span>
                          </div>
                          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-3 rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${todoItems.length ? (completedCount / todoItems.length) * 100 : 0}%` }}
                            />
                          </div>
                          {completedCount === todoItems.length && todoItems.length > 0 && (
                            <p className="text-sm text-emerald-600 font-medium mt-2">🎉 All done! Great work!</p>
                          )}
                        </div>
                      )}

                      {/* Deadlines */}
                      {(summary.deadlines ?? []).length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-orange-700 uppercase tracking-wide mb-2">📆 Deadlines</h3>
                          <div className="space-y-2">
                            {(summary.deadlines ?? []).map((d, i) => {
                              const key   = `dl-${i}`;
                              const done  = checked.has(key);
                              const days  = daysUntil(d.due);
                              const urgency = days <= 3 ? "text-rose-600" : days <= 7 ? "text-orange-600" : "text-gray-500";
                              return (
                                <label
                                  key={key}
                                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${done ? "bg-gray-50 border-gray-200 opacity-60" : "bg-orange-50 border-orange-200 hover:bg-orange-100"}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={done}
                                    onChange={() => toggleCheck(key)}
                                    className="w-5 h-5 rounded accent-emerald-500 cursor-pointer"
                                  />
                                  <span className={`text-sm flex-1 ${done ? "line-through text-gray-400" : ""}`}>{d.label}</span>
                                  <div className="text-right">
                                    <div className="text-xs font-medium">{fmt(d.due)}</div>
                                    <div className={`text-xs ${urgency}`}>
                                      {days === 0 ? "Today!" : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {(summary.actions ?? []).length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-2">⚡ Action Items</h3>
                          <div className="space-y-2">
                            {(summary.actions ?? []).map((a, i) => {
                              const key  = `ac-${i}`;
                              const done = checked.has(key);
                              return (
                                <label
                                  key={key}
                                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${done ? "bg-gray-50 border-gray-200 opacity-60" : "bg-amber-50 border-amber-200 hover:bg-amber-100"}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={done}
                                    onChange={() => toggleCheck(key)}
                                    className="w-5 h-5 rounded accent-emerald-500 cursor-pointer"
                                  />
                                  <span className={`text-sm flex-1 ${done ? "line-through text-gray-400" : ""}`}>{a.label}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${PRIORITY_STYLE[a.priority]}`}>
                                    {a.priority}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {todoItems.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-8">No deadlines or actions found in this note.</p>
                      )}
                    </div>
                  )}

                  {/* ── FOCUS TOPICS TAB ── */}
                  {activeTab === "topics" && (
                    <div className="space-y-3">
                      {(summary.topics ?? []).length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-8">No focus topics found — try summarizing a longer note.</p>
                      )}
                      {(summary.topics ?? []).map((topic, i) => {
                        const googleUrl  = `https://www.google.com/search?q=${encodeURIComponent(topic.searchQuery)}`;
                        const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic.searchQuery)}`;
                        const khanUrl    = `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(topic.name)}`;
                        const colors = [
                          "from-violet-50 border-violet-200",
                          "from-sky-50 border-sky-200",
                          "from-emerald-50 border-emerald-200",
                          "from-amber-50 border-amber-200",
                          "from-rose-50 border-rose-200",
                          "from-indigo-50 border-indigo-200",
                        ];
                        const numColors = [
                          "bg-violet-600",
                          "bg-sky-600",
                          "bg-emerald-600",
                          "bg-amber-500",
                          "bg-rose-500",
                          "bg-indigo-600",
                        ];
                        const c  = colors[i % colors.length];
                        const nc = numColors[i % numColors.length];
                        return (
                          <div key={i} className={`rounded-2xl border bg-gradient-to-br ${c} p-4`}>
                            <div className="flex items-start gap-3 mb-2">
                              <span className={`${nc} text-white text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0`}>
                                {i + 1}
                              </span>
                              <div className="flex-1">
                                <h3 className="font-semibold text-gray-800">{topic.name}</h3>
                                <p className="text-sm text-gray-600 mt-0.5">{topic.description}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                              <ResourceLink href={googleUrl}  icon="🔍" label="Google it" />
                              <ResourceLink href={youtubeUrl} icon="▶️" label="Watch on YouTube" />
                              <ResourceLink href={khanUrl}    icon="📚" label="Khan Academy" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── STUDY PLAN TAB ── */}
                  {activeTab === "plan" && (
                    <div className="space-y-3">
                      {(summary.studyPlan ?? []).length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-8">No study plan generated — try summarizing a longer note.</p>
                      )}
                      {(summary.studyPlan ?? []).map((entry, i) => (
                        <div key={i} className="flex gap-4 p-4 rounded-2xl border bg-gradient-to-br from-amber-50 border-amber-200">
                          <div className="flex flex-col items-center flex-shrink-0">
                            <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm">
                              {entry.day}
                            </div>
                            {i < (summary.studyPlan ?? []).length - 1 && (
                              <div className="w-0.5 flex-1 bg-amber-200 mt-2 min-h-4" />
                            )}
                          </div>
                          <div className="flex-1 pb-2">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-semibold text-gray-800">{entry.task}</span>
                              <span className="text-xs bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 rounded-full whitespace-nowrap">
                                ⏱ {entry.duration}
                              </span>
                            </div>
                            {entry.notes && (
                              <p className="text-sm text-gray-500">{entry.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!summary && !loading && (
            <div className="bg-white rounded-2xl border shadow-sm p-10 text-center">
              <div className="text-5xl mb-4">🧠</div>
              <h2 className="text-lg font-semibold text-gray-700 mb-1">Ready to summarize</h2>
              <p className="text-sm text-gray-400">Paste your notes above and click Summarize — I'll break it down into bullets, a to-do list, focus topics, and a day-by-day study plan.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatRow({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{icon} {label}</span>
      <span className={`font-bold ${color}`}>{value}</span>
    </div>
  );
}

function ResourceLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white border hover:bg-gray-50 font-medium text-gray-700 transition-colors"
    >
      {icon} {label}
    </a>
  );
}
