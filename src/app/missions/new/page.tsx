"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authedFetch, useRequireAuth } from "@/lib/auth/client-guard";
import { ArrowLeft, Target } from "lucide-react";

export default function NewMissionPage() {
  const user = useRequireAuth(); const router = useRouter();
  const [me, setMe] = useState<any>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [form, setForm] = useState({ objective: "Generate 100 qualified leads for my construction business in 30 days.", targetAudience: "Property developers and prospective property buyers in Lusaka", budgetAmount: 2000, deadlineDays: 30, successMetric: "100 qualified leads" });
  useEffect(() => { if (!user) return; authedFetch("/api/me").then(r=>r.json()).then(setMe); }, [user]);
  if (!user || !me) return null;
  if (!me.business) { router.replace("/workspace"); return null; }
  async function createMission() {
    setLoading(true); setError("");
    try { const r = await authedFetch("/api/missions", { method:"POST", body: JSON.stringify({ ...form, businessId: me.business.id, currency:"ZMW" }) }); const d=await r.json(); if(!r.ok) throw new Error(d.error); router.push(`/missions/${d.mission.id}`); }
    catch(e:any){setError(e.message || "Unable to create mission.");} finally{setLoading(false);}
  }
  return <main className="min-h-screen px-5 py-8 md:px-8"><div className="max-w-3xl mx-auto">
    <button onClick={()=>router.push("/workspace")} className="text-sm text-kwacha-gray-400 flex items-center gap-2 mb-8"><ArrowLeft size={16}/> Workspace</button>
    <div className="mb-8"><div className="flex items-center gap-3 mb-3"><div className="p-2 bg-kwacha-gray-800 border border-kwacha-gray-700"><Target size={20}/></div><span className="text-xs tracking-[.25em] text-kwacha-gold">MISSION BUILDER</span></div><h1 className="text-3xl font-semibold">Define the mission</h1><p className="text-kwacha-gray-400 mt-2">Give Kwacha an objective, resources, deadline and measurable outcome.</p></div>
    <div className="kwacha-card p-6 space-y-6">
      <label className="block"><span className="label">Objective</span><textarea className="kwacha-input min-h-28" value={form.objective} onChange={e=>setForm({...form,objective:e.target.value})}/></label>
      <label className="block"><span className="label">Target audience</span><input className="kwacha-input" value={form.targetAudience} onChange={e=>setForm({...form,targetAudience:e.target.value})}/></label>
      <div className="grid md:grid-cols-3 gap-4"><label><span className="label">Budget (ZMW)</span><input type="number" className="kwacha-input" value={form.budgetAmount} onChange={e=>setForm({...form,budgetAmount:Number(e.target.value)})}/></label><label><span className="label">Duration (days)</span><input type="number" className="kwacha-input" value={form.deadlineDays} onChange={e=>setForm({...form,deadlineDays:Number(e.target.value)})}/></label><label><span className="label">Success metric</span><input className="kwacha-input" value={form.successMetric} onChange={e=>setForm({...form,successMetric:e.target.value})}/></label></div>
      {error && <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
      <div className="flex justify-end"><button className="kwacha-btn-primary" disabled={loading} onClick={createMission}>{loading?"Creating…":"Create mission"}</button></div>
    </div>
  </div></main>
}
