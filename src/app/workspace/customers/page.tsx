"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { authedFetch, useRequireAuth } from "@/lib/auth/client-guard";

export default function CustomersPage() {
  const user = useRequireAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    authedFetch("/api/crm/leads").then((r) => r.json()).then((d) => setLeads(d.leads || [])).finally(() => setLoading(false));
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
          <div className="text-xs uppercase tracking-[.22em] gold-text">Customers</div>
          <h1 className="text-2xl font-semibold mt-1">Every real lead the CRM Agent has recorded</h1>
        </div>

        {loading ? (
          <p className="text-sm text-kwacha-gray-500">Loading…</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-kwacha-gray-500">No leads yet. The CRM Agent creates these as missions run.</p>
        ) : (
          <div className="kwacha-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-kwacha-gray-500 border-b border-kwacha-gray-800">
                  <th className="p-3">Name</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Interest</th>
                  <th className="p-3">Stage</th>
                  <th className="p-3">Qualification</th>
                  <th className="p-3">Mission</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} onClick={() => setSelected(l.id)} className="border-b border-kwacha-gray-800 last:border-0 cursor-pointer hover:bg-kwacha-gray-900">
                    <td className="p-3 font-medium">{l.name}</td>
                    <td className="p-3 text-kwacha-gray-400">{l.contact || "—"}</td>
                    <td className="p-3 text-kwacha-gray-400">{l.interest || "—"}</td>
                    <td className="p-3"><span className="text-xs border border-kwacha-gray-700 px-2 py-0.5 rounded-full">{l.status}</span></td>
                    <td className="p-3 text-kwacha-gray-400">{l.qualification}</td>
                    <td className="p-3 text-xs text-kwacha-gray-500 truncate max-w-[160px]">{l.mission?.objective}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <LeadDrawer leadId={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </main>
  );
}

function LeadDrawer({ leadId, onClose, onChanged }: { leadId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authedFetch(`/api/crm/leads/${leadId}`).then((r) => r.json()).then(setData);
  }, [leadId]);

  async function setStatus(status: string) {
    setSaving(true);
    try {
      await authedFetch(`/api/crm/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      const fresh = await (await authedFetch(`/api/crm/leads/${leadId}`)).json();
      setData(fresh);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex justify-end z-50">
      <div className="w-full max-w-md bg-kwacha-black border-l border-kwacha-gray-800 h-full overflow-y-auto p-6">
        <button onClick={onClose} className="text-kwacha-gray-400 mb-4"><X size={18} /></button>
        {!data ? (
          <p className="text-sm text-kwacha-gray-500">Loading…</p>
        ) : (
          <>
            <h2 className="text-lg font-semibold">{data.lead.name}</h2>
            <p className="text-sm text-kwacha-gray-400 mb-4">{data.lead.contact || "No contact on file"}</p>

            <div className="flex gap-2 mb-5 flex-wrap">
              {["new", "qualified", "contacted", "won", "lost"].map((s) => (
                <button
                  key={s}
                  disabled={saving}
                  onClick={() => setStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-full border ${data.lead.status === s ? "bg-kwacha-gold text-black border-kwacha-gold" : "border-kwacha-gray-700 text-kwacha-gray-300"}`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="mb-5">
              <h3 className="text-xs uppercase tracking-wider text-kwacha-gray-500 mb-2">Campaign source</h3>
              <p className="text-sm text-kwacha-gray-300">{data.campaignSource?.objective || "—"}</p>
            </div>

            <div className="mb-5">
              <h3 className="text-xs uppercase tracking-wider text-kwacha-gray-500 mb-2">Conversation history</h3>
              {data.conversation.length === 0 ? (
                <p className="text-sm text-kwacha-gray-500">No messages with this contact yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.conversation.map((m: any) => (
                    <div key={m.id} className={`text-sm p-2 rounded ${m.direction === "outbound" ? "bg-kwacha-gray-900" : "bg-kwacha-gray-800"}`}>
                      <div className="text-xs text-kwacha-gray-500 mb-0.5">{m.direction} · {m.status}</div>
                      {m.body}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-wider text-kwacha-gray-500 mb-2">AI notes</h3>
              {data.aiNotes.length === 0 ? (
                <p className="text-sm text-kwacha-gray-500">No notes yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.aiNotes.map((n: any) => (
                    <div key={n.id} className="text-xs text-kwacha-gray-400">{n.message}</div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
