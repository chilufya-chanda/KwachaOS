"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { authedFetch, useRequireAuth } from "@/lib/auth/client-guard";

export default function InboxPage() {
  const user = useRequireAuth();
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeContact, setActiveContact] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    authedFetch("/api/communication/threads").then((r) => r.json()).then((d) => setThreads(d.threads || [])).finally(() => setLoading(false));
  }, [user]);
  useEffect(() => { load(); }, [load]);

  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-5xl mx-auto">
        <Link href="/workspace" className="inline-flex items-center gap-2 text-sm text-kwacha-gray-400 mb-7">
          <ArrowLeft size={15} /> Workspace
        </Link>
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[.22em] gold-text">Communication Inbox</div>
          <h1 className="text-2xl font-semibold mt-1">Real conversations across connected channels</h1>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="kwacha-card p-3 md:col-span-1 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <p className="text-sm text-kwacha-gray-500 p-2">Loading…</p>
            ) : threads.length === 0 ? (
              <p className="text-sm text-kwacha-gray-500 p-2">No conversations yet.</p>
            ) : (
              threads.map((t) => (
                <button
                  key={`${t.channel}:${t.contactRef}`}
                  onClick={() => setActiveContact(t.contactRef)}
                  className={`w-full text-left p-3 border-b border-kwacha-gray-800 last:border-0 ${activeContact === t.contactRef ? "bg-kwacha-gray-900" : ""}`}
                >
                  <div className="text-sm font-medium">{t.contactRef}</div>
                  <div className="text-xs text-kwacha-gray-500 uppercase">{t.channel}</div>
                  <div className="text-xs text-kwacha-gray-400 truncate mt-1">{t.lastMessage}</div>
                </button>
              ))
            )}
          </div>

          <div className="md:col-span-2">
            {activeContact ? <ThreadView contactRef={activeContact} /> : <div className="kwacha-card p-6 text-sm text-kwacha-gray-500">Select a conversation.</div>}
          </div>
        </div>
      </div>
    </main>
  );
}

function ThreadView({ contactRef }: { contactRef: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    authedFetch(`/api/communication/threads/${encodeURIComponent(contactRef)}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .finally(() => setLoading(false));
  }, [contactRef]);
  useEffect(() => { load(); }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await authedFetch(`/api/communication/threads/${encodeURIComponent(contactRef)}/reply`, { method: "POST", body: JSON.stringify({ body: reply }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.result.ok) throw new Error(data.result.message);
      setReply("");
      load();
    } catch (e: any) {
      setError(e.message || "Unable to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="kwacha-card p-4 flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto space-y-2 mb-3">
        {loading ? (
          <p className="text-sm text-kwacha-gray-500">Loading…</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`text-sm p-2 rounded max-w-[80%] ${m.direction === "outbound" ? "bg-kwacha-gold/15 ml-auto" : "bg-kwacha-gray-800"}`}>
              <div className="text-xs text-kwacha-gray-500 mb-0.5">
                {m.direction === "outbound" ? "AI handling" : "Customer"} · {m.status} · {new Date(m.createdAt).toLocaleTimeString()}
              </div>
              {m.body}
            </div>
          ))
        )}
      </div>
      {error && <div className="text-xs text-red-300 mb-2">{error}</div>}
      <form onSubmit={send} className="flex gap-2">
        <input className="kwacha-input flex-1" placeholder="Reply as human — this is the same real send path the AI uses" value={reply} onChange={(e) => setReply(e.target.value)} />
        <button disabled={sending} className="kwacha-btn-primary flex items-center gap-2"><Send size={14} /></button>
      </form>
    </div>
  );
}
