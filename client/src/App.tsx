import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8080";

type Summary = {
  bullets: string[];
  highlights: string[];
  deadlines: { label: string; due: string }[];
  actions: { label: string; priority: "low" | "medium" | "high" }[];
};

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
            <div className="mt-3 flex gap-2">
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
            {!summary && (
              <p className="text-sm text-gray-500">
                No summary yet. Click “Summarize”.
              </p>
            )}

            {summary && (
              <div className="grid md:grid-cols-2 gap-4">
                <Card title="Bullets">
                  <ul className="list-disc pl-5 space-y-1">
                    {summary.bullets?.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </Card>

                <Card title="Highlights">
                  <ul className="list-disc pl-5 space-y-1">
                    {summary.highlights?.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </Card>

                <Card title="Deadlines">
                  <ul className="space-y-2">
                    {summary.deadlines?.map((d, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span>{d.label}</span>
                        <span className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {d.due}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card title="Actions">
                  <ul className="space-y-1">
                    {summary.actions?.map((a, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span>{a.label}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 border">
                          {a.priority}
                        </span>
                      </li>
                    ))}
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
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-medium mb-2">{title}</h3>
      {children}
    </div>
  );
}
