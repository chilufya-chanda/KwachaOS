"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth, authedFetch } from "@/lib/auth/client-guard";
import { nextStepPath } from "@/lib/onboarding/next-step";
import { signOut } from "@/lib/firebase/client";
import { getPlan } from "@/lib/billing/plans";
import Link from "next/link";

export default function WorkspaceDashboardPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [missions, setMissions] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const data = await authedFetch("/api/me").then((r) => r.json());
      const path = nextStepPath(data);
      if (path !== "/workspace") {
        router.replace(path);
        return;
      }
      setMe(data);
      const missionData = await authedFetch("/api/missions").then((r) => r.json());
      setMissions(missionData.missions ?? []);
    })();
  }, [user, router]);

  if (!user || !me) return null;

  const plan = getPlan(me.subscription.tier);

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <span className="text-sm tracking-widest text-kwacha-gray-300">KWACHA OS</span>
          <button
            onClick={async () => {
              await signOut();
              router.push("/sign-in");
            }}
            className="kwacha-btn-secondary text-sm"
          >
            Sign out
          </button>
        </div>

        <div className="kwacha-card p-6 mb-6">
          <p className="text-xs uppercase tracking-wide text-kwacha-gray-500 mb-1">Workspace</p>
          <h1 className="text-xl font-medium">{me.workspace.name}</h1>
          <p className="text-sm text-kwacha-gray-300 mt-1">
            {plan?.name} · <span className="gold-text">Demo subscription active</span>
          </p>
        </div>

        <div className="kwacha-card p-6 mb-6">
          <p className="text-xs uppercase tracking-wide text-kwacha-gray-500 mb-1">Business</p>
          <h2 className="font-medium">{me.business.name}</h2>
          {me.business.location && (
            <p className="text-sm text-kwacha-gray-300">{me.business.location}</p>
          )}
          {me.business.targetCustomers && (
            <p className="text-sm text-kwacha-gray-300 mt-2">
              Target: {me.business.targetCustomers}
            </p>
          )}
        </div>

        <div className="kwacha-card p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs uppercase tracking-wide text-kwacha-gray-500 mb-1">Mission Control</p><p className="text-sm text-kwacha-gray-300">Turn a business objective into a persistent mission.</p></div><div className="flex gap-2"><Link href="/agents" className="kwacha-btn-secondary text-sm">Agent Registry</Link><Link href="/workspace/wallet" className="kwacha-btn-secondary text-sm">Wallet</Link><Link href="/workspace/customers" className="kwacha-btn-secondary text-sm">Customers</Link><Link href="/workspace/inbox" className="kwacha-btn-secondary text-sm">Inbox</Link><Link href="/workspace/content" className="kwacha-btn-secondary text-sm">Content</Link><Link href="/workspace/integrations" className="kwacha-btn-secondary text-sm">Integrations</Link><Link href="/workspace/settings" className="kwacha-btn-secondary text-sm">Settings</Link>{me.user?.role === "admin" && <Link href="/admin" className="kwacha-btn-secondary text-sm">Admin Console</Link>}<Link href="/developer" className="kwacha-btn-secondary text-sm">Developer Portal</Link><Link href="/missions/history" className="kwacha-btn-secondary text-sm">Mission history</Link><Link href="/missions/new" className="kwacha-btn-primary text-sm">Create mission</Link></div></div>
        </div>

        <div className="kwacha-card p-6 mb-6">
          <div className="flex items-center justify-between mb-4"><p className="text-xs uppercase tracking-wide text-kwacha-gray-500">Missions</p><span className="text-xs text-kwacha-gray-500">{missions.length} total</span></div>
          {missions.length === 0 ? <p className="text-sm text-kwacha-gray-500">No missions yet. Create the first one to open Mission Control.</p> : <div className="space-y-2">{missions.slice(0,5).map((m:any)=><Link key={m.id} href={`/missions/${m.id}`} className="block border border-kwacha-gray-800 p-3 hover:border-kwacha-gray-600"><div className="flex justify-between gap-4"><span className="text-sm">{m.objective}</span><span className="text-xs uppercase text-kwacha-gray-500">{m.status}</span></div><div className="text-xs text-kwacha-gray-600 mt-1">{m._count.leads} leads · {m._count.runs} runs</div></Link>)}</div>}
        </div>

        <div className="kwacha-card p-6 border-dashed">
          <p className="text-sm text-kwacha-gray-300">
            Onboarding is complete. Mission Control now connects Gemini planning to the Agent Registry, tool permissions and server-side execution. External actions remain simulated.
          </p>
        </div>
      </div>
    </main>
  );
}
