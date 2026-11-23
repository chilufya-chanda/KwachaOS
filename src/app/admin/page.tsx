"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, AlertTriangle, Bot, Database, Gauge, HeartPulse, History, LayoutDashboard, LogOut, RefreshCw, ShieldCheck, Users, Workflow } from "lucide-react";
import { authedFetch, useRequireAuth } from "@/lib/auth/client-guard";
import { signOut } from "@/lib/firebase/client";

const tabs=["Overview","Finance","Missions","Agents","Users","Events","Audit"] as const;
type Tab=typeof tabs[number];
export default function AdminPage(){const firebase=useRequireAuth();const router=useRouter();const [me,setMe]=useState<any>(null);const [tab,setTab]=useState<Tab>("Overview");const [data,setData]=useState<any>({});const [error,setError]=useState("");const [busy,setBusy]=useState(false);
async function load(){setBusy(true);setError("");try{const m=await authedFetch("/api/me").then(r=>r.json());setMe(m);if(m?.user?.role!=="admin"){router.replace("/workspace");return;}const [o,h,mis,ags,us,ev,au,fin]=await Promise.all(["/api/admin/overview","/api/admin/health","/api/admin/missions","/api/admin/agents","/api/admin/users","/api/admin/events","/api/admin/audit","/api/admin/finance"].map(p=>authedFetch(p).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed");return d;})));setData({overview:o.metrics,health:h.health,missions:mis.missions,agents:ags.agents,recentRuns:ags.recent,users:us.users,events:ev.events,audit:au.audit,finance:fin});}catch(e){setError(e instanceof Error?e.message:"Unable to load admin console.");}finally{setBusy(false)}}
useEffect(()=>{if(firebase)load()},[firebase]);useEffect(()=>{if(!firebase||!me||me.user?.role!=="admin")return;const id=setInterval(()=>load(),30000);return()=>clearInterval(id)},[firebase,me]);if(!firebase||!me||me.user?.role!=="admin")return null;const o=data.overview||{};const h=data.health||{};
return <main className="min-h-screen px-4 py-6 md:px-8"><div className="max-w-7xl mx-auto"><header className="flex flex-wrap items-center justify-between gap-4 border-b border-kwacha-gray-800 pb-5"><div><div className="text-xs tracking-[.25em] text-kwacha-gray-500">KWACHA OS / ADMIN</div><h1 className="text-2xl font-semibold mt-2">System Control</h1><p className="text-sm text-kwacha-gray-400 mt-1">Operational visibility across missions, agents, AI usage, simulation and audit.</p></div><div className="flex gap-2"><button onClick={load} className="kwacha-btn-secondary text-sm"><RefreshCw size={14} className="inline mr-2"/>Refresh</button><Link href="/workspace" className="kwacha-btn-secondary text-sm">Workspace</Link><button onClick={async()=>{await signOut();router.push("/sign-in")}} className="kwacha-btn-secondary text-sm"><LogOut size={14} className="inline mr-2"/>Sign out</button></div></header>
<nav className="flex flex-wrap gap-1 py-5">{tabs.map(t=><button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 text-sm border ${tab===t?"border-kwacha-gold text-white":"border-kwacha-gray-800 text-kwacha-gray-400"}`}>{t}</button>)}</nav>
{error&&<div className="mb-5 border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-300"><AlertTriangle size={15} className="inline mr-2"/>{error}</div>}
{tab==="Overview"&&<><div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">{[["Users",o.users,Users],["Workspaces",o.workspaces,LayoutDashboard],["Active missions",o.activeMissions,Workflow],["Agent runs",o.agentRuns,Bot],["API requests",o.apiUsage,Activity],["Heartbeats",o.heartbeatRuns,HeartPulse],["Tools",o.tools,Gauge],["Completed",o.completedMissions,ShieldCheck],["Errors",o.errors,AlertTriangle],["Agents active",o.runningAgents,Bot]].map(([n,v,I]:any)=><div className="kwacha-card p-4" key={n}><I size={15} className="text-kwacha-gray-500"/><p className="text-xs text-kwacha-gray-500 mt-3">{n}</p><p className="text-xl font-semibold mt-1">{v??0}</p></div>)}</div><section className="grid lg:grid-cols-2 gap-5"><div className="kwacha-card p-5"><div className="flex items-center gap-2 mb-4"><HeartPulse size={17}/><h2 className="font-medium">System health</h2></div><div className="grid grid-cols-2 gap-2">{Object.entries(h).filter(([k])=>["app","database","gemini","heartbeat","simulation","memory","api"].includes(k)).map(([k,v]:any)=><div key={k} className="border border-kwacha-gray-800 p-3"><p className="text-xs uppercase text-kwacha-gray-500">{k}</p><p className={`text-sm mt-1 ${v==="ok"||v==="active"||v==="available"||v==="configured"?"text-green-300":"text-yellow-300"}`}>{String(v)}</p></div>)}</div><p className="text-xs text-kwacha-gray-600 mt-4">Checked {h.checkedAt?new Date(h.checkedAt).toLocaleString():"—"}</p></div><div className="kwacha-card p-5"><div className="flex items-center gap-2 mb-4"><History size={17}/><h2 className="font-medium">Latest system events</h2></div><EventList events={(data.events||[]).slice(0,8)}/></div></section></>}
{tab==="Finance"&&<FinancePanel data={data.finance||{}}/>}
{tab==="Missions"&&<MissionTable missions={data.missions||[]}/>} {tab==="Agents"&&<AgentPanel agents={data.agents||[]} runs={data.recentRuns||[]}/>} {tab==="Users"&&<UserTable users={data.users||[]}/>} {tab==="Events"&&<EventList events={data.events||[]} full/>} {tab==="Audit"&&<AuditTable rows={data.audit||[]}/>} {busy&&<p className="text-xs text-kwacha-gray-600 mt-5">Refreshing control data…</p>}</div></main>}
function EventList({events,full=false}:{events:any[],full?:boolean}){return <div className={full?"kwacha-card p-5":"space-y-2"}>{events.length===0?<p className="text-sm text-kwacha-gray-500">No system events recorded.</p>:events.slice(0,full?100:8).map(e=><div key={e.id} className="border-b border-kwacha-gray-900 py-2 flex justify-between gap-4"><div><span className={`text-[10px] uppercase mr-2 ${e.level==="error"?"text-red-300":e.level==="warning"?"text-yellow-300":"text-kwacha-gray-500"}`}>{e.level}</span><span className="text-xs">{e.message}</span><p className="text-[10px] text-kwacha-gray-600 mt-1">{e.source}</p></div><time className="text-[10px] text-kwacha-gray-600 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</time></div>)}</div>}
function MissionTable({missions}:{missions:any[]}){return <div className="kwacha-card p-5 overflow-x-auto"><div className="flex items-center gap-2 mb-4"><Workflow size={17}/><h2 className="font-medium">Mission monitor</h2></div><table className="w-full text-sm"><thead className="text-xs uppercase text-kwacha-gray-500"><tr><th className="text-left p-2">Mission</th><th className="text-left p-2">Workspace</th><th className="p-2">Status</th><th className="p-2">Leads</th><th className="p-2">Runs</th><th className="p-2">Heartbeat</th><th className="p-2">Updated</th></tr></thead><tbody>{missions.map(m=><tr key={m.id} className="border-t border-kwacha-gray-900"><td className="p-2 min-w-64"><Link className="hover:underline" href={`/missions/${m.id}`}>{m.objective}</Link><div className="text-[10px] text-kwacha-gray-600">{m.id}</div></td><td className="p-2 text-xs text-kwacha-gray-400">{m.business.workspace.name}</td><td className="p-2 text-center text-xs uppercase">{m.status}</td><td className="p-2 text-center">{m._count.leads}</td><td className="p-2 text-center">{m._count.runs}</td><td className="p-2 text-center">{m._count.heartbeatRuns}</td><td className="p-2 text-center text-xs text-kwacha-gray-500">{new Date(m.updatedAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
function AgentPanel({agents,runs}:{agents:any[],runs:any[]}){return <div className="grid lg:grid-cols-2 gap-5"><div className="kwacha-card p-5"><h2 className="font-medium mb-4">Agent fleet</h2>{agents.map(a=><div key={a.id} className="border-b border-kwacha-gray-900 py-3 flex justify-between"><div><p className="text-sm">{a.name}</p><p className="text-xs text-kwacha-gray-500">{a.key} · {a._count.tasks} tasks · {a._count.runs} runs</p></div><span className="text-xs uppercase">{a.status}</span></div>)}</div><div className="kwacha-card p-5"><h2 className="font-medium mb-4">Recent agent runs</h2>{runs.slice(0,20).map(r=><div key={r.id} className="border-b border-kwacha-gray-900 py-2"><div className="flex justify-between"><span className="text-xs">{r.agent.name}</span><span className="text-[10px] text-kwacha-gray-600">{new Date(r.createdAt).toLocaleString()}</span></div><p className="text-xs text-kwacha-gray-400 mt-1 truncate">{r.mission.objective}</p></div>)}</div></div>}
function UserTable({users}:{users:any[]}){return <div className="kwacha-card p-5 overflow-x-auto"><div className="flex items-center gap-2 mb-4"><Users size={17}/><h2 className="font-medium">User monitor</h2></div><table className="w-full text-sm"><thead className="text-xs uppercase text-kwacha-gray-500"><tr><th className="text-left p-2">User</th><th className="p-2">Role</th><th className="p-2">Tier</th><th className="p-2">Onboarding</th><th className="p-2">Workspaces</th><th className="p-2">Created</th></tr></thead><tbody>{users.map(u=><tr key={u.id} className="border-t border-kwacha-gray-900"><td className="p-2"><p>{u.displayName||"—"}</p><p className="text-xs text-kwacha-gray-500">{u.email}</p></td><td className="p-2 text-center text-xs">{u.role}</td><td className="p-2 text-center text-xs">{u.subscriptionTier}</td><td className="p-2 text-center text-xs">{u.onboardingStatus}</td><td className="p-2 text-center">{u._count.ownedWorkspaces}</td><td className="p-2 text-center text-xs text-kwacha-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
function AuditTable({rows}:{rows:any[]}){return <div className="kwacha-card p-5"><div className="flex items-center gap-2 mb-4"><ShieldCheck size={17}/><h2 className="font-medium">Admin audit log</h2></div>{rows.length===0?<p className="text-sm text-kwacha-gray-500">No audit entries yet.</p>:rows.map(r=><div key={r.id} className="border-b border-kwacha-gray-900 py-3 flex justify-between gap-4"><div><p className="text-sm">{r.action}</p><p className="text-xs text-kwacha-gray-500">{r.admin.displayName||r.admin.email} · {r.target||"—"}</p></div><time className="text-xs text-kwacha-gray-600">{new Date(r.createdAt).toLocaleString()}</time></div>)}</div>}

function FinancePanel({ data }: { data: any }) {
  const wallets = data.wallets || { totalBalance: 0, count: 0 };
  const month = data.thisMonth || { providerCost: 0, customerCharge: 0, margin: 0, marginPct: 0 };
  const agentProfitability: any[] = data.agentProfitability || [];
  const modelCosts: any[] = data.modelCosts || [];
  const agentHealth: any[] = data.agentHealth || [];

  return (
    <div className="space-y-5">
      <div className="border border-kwacha-gray-800 bg-kwacha-gray-900/40 p-3 text-xs text-kwacha-gray-500">
        Scoped to what's genuinely computable from real data in this build. Deliberately excludes MRR, churn, retention,
        customer acquisition cost, cash flow, hosting cost, and provider-dependency dashboards — those need either a real
        multi-customer base or real infrastructure this build doesn't have. See the README for why.
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="kwacha-card p-4">
          <p className="text-xs text-kwacha-gray-500">Total wallet balance</p>
          <p className="text-xl font-semibold mt-1">${wallets.totalBalance.toFixed(2)}</p>
          <p className="text-[10px] text-kwacha-gray-600 mt-1">{wallets.count} wallet(s)</p>
        </div>
        <div className="kwacha-card p-4">
          <p className="text-xs text-kwacha-gray-500">AI provider cost (this month)</p>
          <p className="text-xl font-semibold mt-1">${month.providerCost.toFixed(4)}</p>
        </div>
        <div className="kwacha-card p-4">
          <p className="text-xs text-kwacha-gray-500">Customer charge (this month)</p>
          <p className="text-xl font-semibold mt-1">${month.customerCharge.toFixed(4)}</p>
        </div>
        <div className="kwacha-card p-4">
          <p className="text-xs text-kwacha-gray-500">Margin (this month)</p>
          <p className="text-xl font-semibold mt-1">${month.margin.toFixed(4)}</p>
          <p className="text-[10px] text-kwacha-gray-600 mt-1">{month.marginPct.toFixed(1)}%</p>
        </div>
      </div>

      <section className="kwacha-card p-5">
        <h2 className="font-medium mb-4">Agent profitability (this month)</h2>
        {agentProfitability.length === 0 ? (
          <p className="text-sm text-kwacha-gray-500">No AI usage recorded yet this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-kwacha-gray-500">
              <tr><th className="text-left p-2">Agent</th><th className="p-2">Calls</th><th className="p-2">Provider cost</th><th className="p-2">Customer charge</th><th className="p-2">Margin</th></tr>
            </thead>
            <tbody>
              {agentProfitability.map((a) => (
                <tr key={a.agentId} className="border-t border-kwacha-gray-900">
                  <td className="p-2">{a.agentName}</td>
                  <td className="p-2 text-center">{a.calls}</td>
                  <td className="p-2 text-center">${a.providerCost.toFixed(4)}</td>
                  <td className="p-2 text-center">${a.customerCharge.toFixed(4)}</td>
                  <td className="p-2 text-center">${a.margin.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="kwacha-card p-5">
        <h2 className="font-medium mb-4">Model Cost Engine — cost by provider/model (this month)</h2>
        {modelCosts.length === 0 ? (
          <p className="text-sm text-kwacha-gray-500">No AI usage recorded yet this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-kwacha-gray-500">
              <tr><th className="text-left p-2">Model</th><th className="p-2">Calls</th><th className="p-2">Provider cost</th><th className="p-2">Customer charge</th></tr>
            </thead>
            <tbody>
              {modelCosts.map((m) => (
                <tr key={m.model} className="border-t border-kwacha-gray-900">
                  <td className="p-2 font-mono text-xs">{m.model}</td>
                  <td className="p-2 text-center">{m.calls}</td>
                  <td className="p-2 text-center">${m.providerCost.toFixed(4)}</td>
                  <td className="p-2 text-center">${m.customerCharge.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="kwacha-card p-5">
        <h2 className="font-medium mb-4">Agent health — real task success/failure rates</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {agentHealth.map((h) => (
            <div key={h.agentKey} className="border border-kwacha-gray-800 p-3">
              <div className="flex justify-between text-sm mb-1">
                <span>{h.agentName}</span>
                <span className={h.successRate === null ? "text-kwacha-gray-500" : h.successRate >= 80 ? "text-green-300" : h.successRate >= 50 ? "text-yellow-300" : "text-red-300"}>
                  {h.successRate === null ? "no tasks yet" : `${h.successRate.toFixed(0)}% success`}
                </span>
              </div>
              <p className="text-xs text-kwacha-gray-500">{h.done} done · {h.failed} failed · {h.other} other · {h.total} total</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
