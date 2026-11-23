"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth, authedFetch } from "@/lib/auth/client-guard";
import { ArrowLeft, History } from "lucide-react";

export default function MissionHistoryPage(){
  const user=useRequireAuth(); const [missions,setMissions]=useState<any[]>([]);
  useEffect(()=>{if(user)authedFetch("/api/missions/history").then(r=>r.json()).then(d=>setMissions(d.missions??[]));},[user]);
  if(!user)return null;
  return <main className="min-h-screen px-4 py-8 md:px-8"><div className="max-w-5xl mx-auto"><Link href="/workspace" className="text-sm text-kwacha-gray-400 flex items-center gap-2 mb-7"><ArrowLeft size={16}/> Workspace</Link><div className="flex items-center gap-3 mb-6"><History className="text-kwacha-gold" size={20}/><div><div className="text-xs uppercase tracking-[.2em] text-kwacha-gold">Mission History</div><h1 className="text-2xl font-semibold">Persistent execution record</h1></div></div><div className="kwacha-card overflow-hidden"><div className="divide-y divide-kwacha-gray-800">{missions.length===0?<div className="p-6 text-sm text-kwacha-gray-500">No mission history yet.</div>:missions.map(m=><Link key={m.id} href={`/missions/${m.id}`} className="block p-5 hover:bg-kwacha-gray-850"><div className="flex flex-wrap justify-between gap-4"><div><div className="text-sm font-medium">{m.objective}</div><div className="text-xs text-kwacha-gray-500 mt-1">{m.business.name} · Updated {new Date(m.updatedAt).toLocaleString()}</div></div><div className="text-xs uppercase tracking-wider text-kwacha-gray-400">{m.status}</div></div><div className="mt-3 flex gap-5 text-xs text-kwacha-gray-500"><span>{m._count.leads} leads</span><span>{m._count.runs} agent runs</span><span>{m._count.decisions} decisions</span></div></Link>)}</div></div></div></main>
}
