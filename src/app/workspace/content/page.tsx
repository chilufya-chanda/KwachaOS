"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { authedFetch, useRequireAuth } from "@/lib/auth/client-guard";

export default function ContentStudioPage() {
  const user = useRequireAuth();
  const [drafts, setDrafts] = useState<any[]>([]);
  const [socialPosts, setSocialPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    if (!user) return;
    authedFetch("/api/content/drafts")
      .then((r) => r.json())
      .then((d) => {
        setDrafts(d.drafts || []);
        setSocialPosts(d.socialPosts || []);
      })
      .finally(() => setLoading(false));
  }, [user]);
  useEffect(() => { load(); }, [load]);

  async function saveEdit(id: string) {
    const body = editing[id];
    if (body === undefined) return;
    await authedFetch(`/api/content/drafts/${id}`, { method: "PATCH", body: JSON.stringify({ body }) });
    setEditing((e) => { const n = { ...e }; delete n[id]; return n; });
    load();
  }

  async function publish(id: string) {
    setPublishing(id);
    try {
      const res = await authedFetch(`/api/content/drafts/${id}/publish`, { method: "POST" });
      const data = await res.json();
      setNotes((n) => ({ ...n, [id]: data.result?.message || data.error || "" }));
      load();
    } finally {
      setPublishing(null);
    }
  }

  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/workspace" className="inline-flex items-center gap-2 text-sm text-kwacha-gray-400 mb-7">
          <ArrowLeft size={15} /> Workspace
        </Link>
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[.22em] gold-text">Content Studio</div>
          <h1 className="text-2xl font-semibold mt-1">Real drafts, written by the Content Agent</h1>
          <p className="text-sm text-kwacha-gray-500 mt-1">Publishing here calls the real platform API when connected — same code the agent uses, triggered by you.</p>
        </div>

        {loading ? (
          <p className="text-sm text-kwacha-gray-500">Loading…</p>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-kwacha-gray-500">No drafts yet. The Content Agent creates these as missions run.</p>
        ) : (
          <div className="space-y-3">
            {drafts.map((d) => (
              <div key={d.id} className="kwacha-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="border border-kwacha-gray-700 px-2 py-0.5 rounded-full uppercase">{d.platform}</span>
                    <span className="text-kwacha-gray-500">{d.kind}</span>
                    <span className={`px-2 py-0.5 rounded-full ${d.status === "published" ? "text-emerald-400 border border-emerald-900" : "text-kwacha-gray-400 border border-kwacha-gray-700"}`}>{d.status}</span>
                  </div>
                  <span className="text-xs text-kwacha-gray-500">{d.mission?.objective}</span>
                </div>
                <textarea
                  className="kwacha-input w-full text-sm"
                  rows={3}
                  defaultValue={d.body}
                  onChange={(e) => setEditing((s) => ({ ...s, [d.id]: e.target.value }))}
                />
                <div className="flex items-center gap-2 mt-2">
                  {editing[d.id] !== undefined && (
                    <button onClick={() => saveEdit(d.id)} className="text-xs kwacha-btn-secondary">Save edit</button>
                  )}
                  <button
                    onClick={() => publish(d.id)}
                    disabled={publishing === d.id || d.status === "published"}
                    className="text-xs kwacha-btn-primary flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send size={12} /> {d.status === "published" ? "Published" : publishing === d.id ? "Publishing…" : "Publish now"}
                  </button>
                </div>
                {notes[d.id] && <p className="text-xs text-kwacha-gray-400 mt-2">{notes[d.id]}</p>}
              </div>
            ))}
          </div>
        )}

        {socialPosts.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-medium mb-3">Publish history</h2>
            <div className="kwacha-card divide-y divide-kwacha-gray-800">
              {socialPosts.map((p) => (
                <div key={p.id} className="p-3 flex justify-between text-sm">
                  <span className="text-kwacha-gray-300">{p.platform}</span>
                  <span className={p.status === "published" ? "text-emerald-400" : p.status === "not_connected" ? "text-kwacha-gray-500" : "text-red-400"}>{p.status}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
