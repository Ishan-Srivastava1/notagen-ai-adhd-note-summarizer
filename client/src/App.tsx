import { useEffect, useMemo, useState } from "react";
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

export default function App() {
  const [health, setHealth] = useState("checking…");
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

    // Category filters for Bullets
  const [showCats, setShowCats] = useState<string[]>([
    "concept",
    "definition",
    "example",
    "tip",
    "warning",
  ]);

  const toggleCat = (c: string) =>
    setShowCats((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  // Date formatting for deadlines
  const fmt = (d: string) => new Date(d).toLocaleDateString();


  // Initial load: health + notes
  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((d) => setHealth(d.ok ? "ok" : "not ok"))
      .catch(() => setHealth("error"));

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
      } catch (e) {
        // ignore if notes route not present yet
      }
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, rawText }),
    });
    if (!r.ok) throw new Error(await r.text());
    const { note } = await r.json();
    return note as Note;
  }

  async function onNewNote() {
    setErr(null);
    const title = prompt("Title for the note?", "Untitled") || "Untitled";
    const raw = text.trim() || "Empty note";
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
    try {
      const note = await fetchNote(id);
      setSelected(note);
      setText(note.rawText ?? "");
      setCached(null);
    } catch (e: any) {
      setErr(e.message || "Failed to load note");
    }
  }

  async function onSummarize() {
    if (!text.trim()) return;
    setErr(null);
    setLoading(true);
    setCached(null);
    try {
      const body: any = { text };
      if (selected?.id) body.noteId = selected.id;

      const r = await fetch(`${API}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();

      setCached(Boolean(data?.meta?.cached));

      // refresh selected note to get persisted summary
      if (selected?.id) {
        const note = await fetchNote(selected.id);
        setSelected(note);
      } else {
        // if no note, just show the summary inline
        setSelected((prev) =>
          prev ? { ...prev, summary: data.summary } : prev
        );
      }
    } catch (e: any) {
      setErr(e.message || "Summarization failed");
    } finally {
      setLoading(false);
    }
  }

  const summary: Summary | null = useMemo(
    () => (selected?.summary ?? null) as any,
    [selected]
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="px-6 py-4 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">NotaGen — ADHD Summarizer</h1>
            <p className="text-sm text-gray-500">
              API: {API} &middot; health: {health}
              {cached !== null && (
                <span className="ml-2 inline-flex items-center text-xs px-2 py-0.5 rounded border bg-gray-100">
                  {cached ? "cached" : "fresh"}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onNewNote}
            className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            + New note
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="grid md:grid-cols-[280px_1fr] gap-6 p-6">
        {/* Sidebar: Notes list */}
        <aside className="bg-white border rounded-2xl p-4 h-fit md:sticky md:top-20">
          <h2 className="font-semibold mb-2">Notes</h2>
          <ul className="space-y-1 max-h-[65vh] overflow-auto pr-1">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => onSelectNote(n.id)}
                  className={[
                    "w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100",
                    selected?.id === n.id ? "bg-gray-100 font-medium" : "",
                  ].join(" ")}
                >
                  <div className="truncate">{n.title}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(n.updatedAt).toLocaleString()}
                  </div>
                </button>
              </li>
            ))}
            {notes.length === 0 && (
              <li className="text-sm text-gray-500">No notes yet</li>
            )}
          </ul>
        </aside>

        {/* Editor + Summary */}
        <section className="space-y-4">
          {err && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 border border-red-200">
              {err}
            </div>
          )}

          <div className="bg-white border rounded-2xl p-4">
            <label className="block text-sm font-medium mb-2">Raw Text</label>
            <textarea
              className="w-full h-40 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Paste or type your notes…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="mt-3 sticky bottom-4 flex gap-2 bg-white/80 backdrop-blur p-2 rounded-xl border w-fit">
              <button
                onClick={onSummarize}
                disabled={loading || text.trim().length < 10}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? "Summarizing…" : "Summarize"}
              </button>
              <button
                onClick={() => selected && setText(selected.rawText || "")}
                className="px-4 py-2 rounded-lg border hover:bg-gray-50"
              >
                Load note’s raw text
              </button>
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-4">
            <h2 className="font-semibold mb-3">Summary</h2>

            {loading && <div className="animate-pulse h-24 rounded-xl bg-slate-100 mb-3" />}

            {!summary && (
              <p className="text-sm text-gray-500">
                No summary yet. Click “Summarize”.
              </p>
            )}

            {summary && (
              <div className="grid md:grid-cols-2 gap-4">
                <Card
                  title="Bullets"
                  onCopy={() =>
                    navigator.clipboard.writeText(
                      (summary?.bullets ?? []).map((b) => `• ${b.text}`).join("\n")
                    )
                  }
                >
                  {/* Legend / filter */}
                  <div className="mb-2">
                    {["concept", "definition", "example", "tip", "warning"].map((c) => {
                      const color = categoryColor(c);
                      return (
                        <button
                          key={c}
                          onClick={() => toggleCat(c)}
                          className={`${chipClass(color)} mr-2 ${
                            showCats.includes(c) ? "opacity-100" : "opacity-40"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>

                  {/* Filtered bullets */}
                  <ul className="space-y-2">
                    {(summary?.bullets ?? [])
                      .filter((b) => showCats.includes(b.category))
                      .map((b, i) => {
                        const color = categoryColor(b.category);
                        return (
                          <li key={i} className="p-2 rounded-lg border bg-white">
                            <div className={`border-l-4 pl-3 border-${color}-300`}>
                              <div className="flex items-center gap-2">
                                <span className={chipClass(color)}>{b.category}</span>
                                <span className="text-sm">{b.text}</span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    {summary?.bullets?.length === 0 && (
                      <li className="text-sm text-gray-500">No bullets yet</li>
                    )}
                  </ul>
                </Card>

                <Card
                  title="Highlights"
                  onCopy={() =>
                    navigator.clipboard.writeText(
                      (summary?.highlights ?? []).map((h) => `• ${h.text}`).join("\n")
                    )
                  }
                >
                  <ul className="space-y-2">
                    {(summary?.highlights ?? []).map((h, i) => {
                      const color = categoryColor(h.category);
                      return (
                        <li key={i} className="p-2 rounded-lg border bg-white">
                          <div className={`border-l-4 pl-3 border-${color}-300`}>
                            <div className="flex items-center gap-2">
                              <span className={chipClass(color)}>{h.category}</span>
                              <span className="text-sm">{h.text}</span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                    {summary?.highlights?.length === 0 && (
                      <li className="text-sm text-gray-500">No highlights yet</li>
                    )}
                  </ul>
                </Card>

                <Card
                  title="Deadlines"
                  onCopy={() =>
                    navigator.clipboard.writeText(
                      (summary?.deadlines ?? [])
                        .map((d) => `- ${d.label} — ${fmt(d.due)}`)
                        .join("\n")
                    )
                  }
                >
                  <ul className="space-y-2">
                    {(summary?.deadlines ?? []).map((d, i) => {
                      const color = categoryColor(d.category); // "deadline" -> rose (per colors.ts)
                      return (
                        <li key={i} className="p-2 rounded-lg border bg-white">
                          <div
                            className={`flex items-center justify-between border-l-4 pl-3 border-${color}-300`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={chipClass(color)}>{d.category}</span>
                              <span className="text-sm">{d.label}</span>
                            </div>
                            <span className="text-xs px-2 py-1 rounded border bg-white">
                              {fmt(d.due)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                    {summary?.deadlines?.length === 0 && (
                      <li className="text-sm text-gray-500">No deadlines found</li>
                    )}
                  </ul>
                </Card>

                <Card
                  title="Actions"
                  onCopy={() =>
                    navigator.clipboard.writeText(
                      (summary?.actions ?? [])
                        .map((a) => `- [${a.priority}] ${a.label}`)
                        .join("\n")
                    )
                  }
                >
                  <ul className="space-y-2">
                    {(summary?.actions ?? []).map((a, i) => {
                      const color = categoryColor(a.category); // "action" -> sky (per colors.ts)
                      const priorityChip =
                        a.priority === "high"
                          ? "bg-rose-100 text-rose-800 border-rose-200"
                          : a.priority === "medium"
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-emerald-100 text-emerald-800 border-emerald-200";

                      return (
                        <li key={i} className="p-2 rounded-lg border bg-white">
                          <div
                            className={`flex items-center justify-between border-l-4 pl-3 border-${color}-300`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={chipClass(color)}>{a.category}</span>
                              <span className="text-sm">{a.label}</span>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded border ${priorityChip}`}>
                              {a.priority}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                    {summary?.actions?.length === 0 && (
                      <li className="text-sm text-gray-500">No actions yet</li>
                    )}
                  </ul>
                </Card>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Card({
  title,
  children,
  onCopy,
}: {
  title: string;
  children: React.ReactNode;
  onCopy?: () => void;
}) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium">{title}</h3>
        {onCopy && (
          <button
            onClick={onCopy}
            className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
          >
            Copy
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

