"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, ShieldCheck, Wrench } from "lucide-react";
import { authedFetch, useRequireAuth } from "@/lib/auth/client-guard";

export default function AgentsPage() {
  const user = useRequireAuth(); const [agents, setAgents] = useState<any[]>([]);
  useEffect(() => { if (user) authedFetch("/api/agents").then(r => r.json()).then(d => setAgents(d.agents || [])); }, [user]);
  if (!user) return null;
  return <main className="min-h-screen px-4 py-8 md:px-8"><div className="max-w-6xl mx-auto">
    <Link href="/workspace" className="inline-flex items-center gap-2 text-sm text-kwacha-gray-400 mb-7"><ArrowLeft size={15}/> Workspace</Link>
    <div className="mb-7"><div className="text-xs uppercase tracking-[.22em] gold-text">Agent Registry</div><h1 className="text-3xl font-semibold mt-2">Autonomous agent fleet</h1><p className="text-sm text-kwacha-gray-400 mt-2 max-w-2xl">Each agent has an explicit capability boundary, approved tool set and execution state. The registry is descriptive; the permission engine remains the authority for every tool call.</p></div>
    <div className="grid md:grid-cols-2 gap-4">{agents.map(a => <section key={a.key} className="kwacha-card p-5"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className="p-2 border border-kwacha-gray-700"><Bot size={18}/></div><div><h2 className="font-medium">{a.name}</h2><p className="text-xs text-kwacha-gray-500 mt-1 uppercase tracking-wider">{a.status}</p></div></div><span className="text-xs text-kwacha-gold">{a.key}</span></div><p className="text-sm text-kwacha-gray-300 mt-4">{a.description}</p><div className="mt-5"><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-kwacha-gray-500"><Wrench size={13}/> Allowed tools</div><div className="flex flex-wrap gap-2 mt-2">{a.allowedTools.map((t:string)=><span key={t} className="text-xs border border-kwacha-gray-700 px-2 py-1 text-kwacha-gray-300">{t}</span>)}</div></div><div className="mt-5 border-t border-kwacha-gray-800 pt-4"><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-kwacha-gray-500"><ShieldCheck size={13}/> Forbidden actions</div><ul className="mt-2 text-xs text-kwacha-gray-400 space-y-1 list-disc pl-4">{a.forbiddenActions.map((x:string)=><li key={x}>{x}</li>)}</ul></div></section>)}</div>
  </div></main>;
}
