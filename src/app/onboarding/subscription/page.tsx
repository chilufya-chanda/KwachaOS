"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useRequireAuth, authedFetch } from "@/lib/auth/client-guard";
import { nextStepPath } from "@/lib/onboarding/next-step";
import { PLANS } from "@/lib/billing/plans";

export default function SubscriptionOnboardingPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const me = await authedFetch("/api/me").then((r) => r.json());
      const path = nextStepPath(me);
      if (path !== "/onboarding/subscription") {
        router.replace(path);
        return;
      }
      setWorkspaceId(me.workspace.id);
      setChecking(false);
    })();
  }, [user, router]);

  if (!user || checking || !workspaceId) return null;

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-medium mb-2">Choose your plan</h1>
          <p className="text-sm text-kwacha-gray-300">
            Prices shown are <span className="gold-text">DEMO PRICING</span> — not connected to a
            real billing system.
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <div key={plan.tier} className="kwacha-card p-5 flex flex-col">
              <h3 className="font-medium mb-1">{plan.name}</h3>
              <p className="text-xs text-kwacha-gray-300 mb-4">{plan.tagline}</p>
              <p className="text-2xl font-semibold mb-1">
                {plan.demoPriceZmw === null ? (
                  "Contact us"
                ) : plan.demoPriceZmw === 0 ? (
                  "Free"
                ) : (
                  <>
                    K{plan.demoPriceZmw}
                    <span className="text-sm text-kwacha-gray-500">/mo</span>
                  </>
                )}
              </p>
              {plan.demoPriceZmw !== null && (
                <p className="text-[10px] uppercase tracking-wide text-kwacha-gray-500 mb-4">
                  Demo pricing
                </p>
              )}
              <ul className="space-y-2 text-sm text-kwacha-gray-300 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={14} className="gold-text mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.tier === "enterprise" ? (
                <button disabled className="kwacha-btn-secondary w-full opacity-60">
                  Contact Sales
                </button>
              ) : (
                <button
                  onClick={() =>
                    router.push(`/onboarding/payment?workspaceId=${workspaceId}&tier=${plan.tier}`)
                  }
                  className="kwacha-btn-primary w-full"
                >
                  {plan.tier === "lite" ? "Continue Free" : "Select Plan"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
