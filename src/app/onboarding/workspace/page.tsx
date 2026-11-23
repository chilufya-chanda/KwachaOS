"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, User, Code2, Building2 } from "lucide-react";
import { useRequireAuth, authedFetch } from "@/lib/auth/client-guard";
import { nextStepPath } from "@/lib/onboarding/next-step";

const TYPES = [
  { key: "personal", label: "Personal", icon: User },
  { key: "business", label: "Business", icon: Briefcase },
  { key: "developer", label: "Developer", icon: Code2 },
  { key: "organization", label: "Organization", icon: Building2 },
] as const;

export default function WorkspaceOnboardingPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["key"]>("business");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // If this user already has a workspace, don't let them create a second
  // one here — resume wherever they actually left off.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const me = await authedFetch("/api/me").then((r) => r.json());
      const path = nextStepPath(me);
      if (path !== "/onboarding/workspace") {
        router.replace(path);
      } else {
        setChecking(false);
      }
    })();
  }, [user, router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authedFetch("/api/workspace", {
        method: "POST",
        body: JSON.stringify({ name, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create workspace.");
      router.push("/onboarding/subscription");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!user || checking) return null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-medium mb-1">Create your workspace</h1>
        <p className="text-sm text-kwacha-gray-300 mb-8">
          A workspace holds your businesses, missions and agents.
        </p>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-6">
          <div>
            <label className="text-xs text-kwacha-gray-300 block mb-1">Workspace name</label>
            <input
              type="text"
              required
              placeholder="Example Construction Ltd"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="kwacha-input"
            />
          </div>

          <div>
            <label className="text-xs text-kwacha-gray-300 block mb-2">Workspace type</label>
            <div className="grid grid-cols-2 gap-3">
              {TYPES.map(({ key, label, icon: Icon }) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setType(key)}
                  className={`kwacha-card p-4 text-left transition-colors ${
                    type === key ? "border-kwacha-gold" : "hover:border-kwacha-gray-500"
                  }`}
                >
                  <Icon size={18} className={type === key ? "gold-text" : "text-kwacha-gray-300"} />
                  <p className="text-sm mt-2">{label}</p>
                </button>
              ))}
            </div>
          </div>

          <button type="submit" disabled={loading} className="kwacha-btn-primary w-full">
            {loading ? "Creating workspace…" : "Create Workspace"}
          </button>
        </form>
      </div>
    </main>
  );
}
