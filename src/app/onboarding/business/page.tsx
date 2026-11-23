"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth, authedFetch } from "@/lib/auth/client-guard";
import { nextStepPath } from "@/lib/onboarding/next-step";

const GOALS = [
  { key: "generate_leads", label: "Generate leads" },
  { key: "increase_sales", label: "Increase sales" },
  { key: "improve_marketing", label: "Improve marketing" },
  { key: "research_markets", label: "Research markets" },
  { key: "automate_support", label: "Automate customer support" },
  { key: "analyze_performance", label: "Analyze business performance" },
  { key: "create_content", label: "Create content" },
  { key: "other", label: "Other" },
] as const;

export default function BusinessOnboardingPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState<(typeof GOALS)[number]["key"]>("generate_leads");
  const [targetCustomers, setTargetCustomers] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("ZMW");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const me = await authedFetch("/api/me").then((r) => r.json());
      const path = nextStepPath(me);
      if (path !== "/onboarding/business") {
        router.replace(path);
        return;
      }
      setWorkspaceId(me.workspace.id);
      setChecking(false);
    })();
  }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authedFetch("/api/business", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          name,
          industry: industry || undefined,
          location: location || undefined,
          description: description || undefined,
          mainGoal: goal,
          targetCustomers: targetCustomers || undefined,
          availableBudget: budget ? Number(budget) : undefined,
          currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save your business.");
      router.push("/workspace");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!user || checking) return null;

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-xl mx-auto">
        <h1 className="text-xl font-medium mb-1">Welcome to your Kwacha workspace</h1>
        <p className="text-sm text-kwacha-gray-300 mb-8">Tell us about your business.</p>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-xs text-kwacha-gray-300 block mb-1">Business name</label>
            <input
              required
              className="kwacha-input"
              placeholder="Example Construction Ltd"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-kwacha-gray-300 block mb-1">Industry</label>
              <input
                className="kwacha-input"
                placeholder="Construction"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-kwacha-gray-300 block mb-1">Location</label>
              <input
                className="kwacha-input"
                placeholder="Lusaka, Zambia"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-kwacha-gray-300 block mb-1">Business description</label>
            <textarea
              className="kwacha-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-kwacha-gray-300 block mb-2">
              What should Kwacha help you accomplish?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {GOALS.map((g) => (
                <button
                  type="button"
                  key={g.key}
                  onClick={() => setGoal(g.key)}
                  className={`text-sm text-left px-3 py-2 rounded-lg border ${
                    goal === g.key
                      ? "border-kwacha-gold gold-text"
                      : "border-kwacha-gray-700 text-kwacha-gray-300 hover:border-kwacha-gray-500"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-kwacha-gray-300 block mb-1">Target customers</label>
            <input
              className="kwacha-input"
              placeholder="Property developers and prospective property buyers in Lusaka"
              value={targetCustomers}
              onChange={(e) => setTargetCustomers(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-kwacha-gray-300 block mb-1">Available budget</label>
              <input
                type="number"
                min="0"
                className="kwacha-input"
                placeholder="2000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-kwacha-gray-300 block mb-1">Currency</label>
              <select
                className="kwacha-input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="ZMW">ZMW (Kwacha)</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={loading} className="kwacha-btn-primary w-full">
            {loading ? "Saving…" : "Finish Setup"}
          </button>
        </form>
      </div>
    </main>
  );
}
