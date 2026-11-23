"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldAlert, Wallet as WalletIcon } from "lucide-react";
import { authedFetch, useRequireAuth } from "@/lib/auth/client-guard";

type WalletTransaction = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  provider: string | null;
  reference: string | null;
  createdAt: string;
};

type WalletData = {
  wallet: {
    balance: number;
    currency: string;
    autoTopUpEnabled: boolean;
    autoTopUpThreshold: number;
    autoTopUpAmount: number;
  };
  usedThisMonth: number;
  usageByCategory: Record<string, number>;
  recentTransactions: WalletTransaction[];
};

const LOW_BALANCE_THRESHOLD = 5;

export default function WalletPage() {
  const user = useRequireAuth();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [funding, setFunding] = useState(false);
  const [fundAmount, setFundAmount] = useState("20");
  const [cardNumber, setCardNumber] = useState("");
  const [fundError, setFundError] = useState("");
  const [fundResult, setFundResult] = useState<"authorized" | "declined" | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    authedFetch("/api/wallet")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  function useDemoCard() {
    setCardNumber("4242 4242 4242 4242");
  }

  async function fund(e: React.FormEvent) {
    e.preventDefault();
    setFunding(true);
    setFundError("");
    setFundResult(null);
    try {
      const res = await authedFetch("/api/wallet/fund", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(fundAmount),
          cardNumber: cardNumber.replace(/\s+/g, ""),
          expiry: "12/30",
          cvc: "123",
          cardholder: "Demo User",
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Unable to fund the wallet.");
      setFundResult(result.result);
      if (result.result === "authorized") load();
    } catch (e: any) {
      setFundError(e.message || "Unable to fund the wallet.");
    } finally {
      setFunding(false);
    }
  }

  async function updateAutoTopUp(patch: Record<string, unknown>) {
    setSavingSettings(true);
    try {
      await authedFetch("/api/wallet/auto-topup", { method: "PATCH", body: JSON.stringify(patch) });
      load();
    } finally {
      setSavingSettings(false);
    }
  }

  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/workspace" className="inline-flex items-center gap-2 text-sm text-kwacha-gray-400 mb-7">
          <ArrowLeft size={15} /> Workspace
        </Link>

        <div className="mb-7 flex items-center gap-3">
          <WalletIcon className="gold-text" size={22} />
          <div>
            <div className="text-xs uppercase tracking-[.22em] gold-text">Agent Wallet</div>
            <h1 className="text-2xl font-semibold mt-1">Funds your AI workforce actually spends</h1>
          </div>
        </div>

        {loading || !data ? (
          <p className="text-sm text-kwacha-gray-500">Loading…</p>
        ) : (
          <>
            {data.wallet.balance < LOW_BALANCE_THRESHOLD && (
              <div className="mb-6 border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-300 flex items-center gap-2">
                <ShieldAlert size={16} />
                Balance is low — agents will pause automatically once it reaches $0.
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <section className="kwacha-card p-5">
                <h2 className="text-xs uppercase tracking-wider text-kwacha-gray-500 mb-2">Balance</h2>
                <div className="text-3xl font-semibold">
                  ${data.wallet.balance.toFixed(2)}
                  <span className="text-sm text-kwacha-gray-500 ml-1">{data.wallet.currency}</span>
                </div>
                <div className="text-sm text-kwacha-gray-400 mt-2">${data.usedThisMonth.toFixed(2)} used this month</div>
              </section>

              <section className="kwacha-card p-5">
                <h2 className="text-xs uppercase tracking-wider text-kwacha-gray-500 mb-3">Usage by category</h2>
                {Object.keys(data.usageByCategory).length === 0 ? (
                  <p className="text-sm text-kwacha-gray-500">No usage recorded this month yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(data.usageByCategory).map(([category, amount]) => (
                      <div key={category} className="flex justify-between text-sm">
                        <span className="text-kwacha-gray-300">{category}</span>
                        <span className="text-kwacha-gray-400">${amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="kwacha-card p-5 mb-6">
              <h2 className="text-sm font-medium mb-1">Add funds</h2>
              <div className="bg-kwacha-gold/10 border border-kwacha-gold/40 rounded-lg px-3 py-2 mb-4 text-xs gold-text">
                DEMO PAYMENT ENVIRONMENT — no real money will be charged.
              </div>

              {fundResult === "authorized" && (
                <div className="mb-4 text-sm text-emerald-300 bg-emerald-950/30 border border-emerald-900 rounded-lg px-3 py-2">
                  Funds added successfully (simulated).
                </div>
              )}
              {fundResult === "declined" && (
                <div className="mb-4 text-sm text-red-300 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">
                  Simulated decline — try the demo card below.
                </div>
              )}
              {fundError && (
                <div className="mb-4 text-sm text-red-300 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">{fundError}</div>
              )}

              <button type="button" onClick={useDemoCard} className="kwacha-btn-secondary text-sm mb-4">
                Use Demo Card
              </button>

              <form onSubmit={fund} className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-kwacha-gray-400 block mb-1">Amount (USD)</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    className="kwacha-input"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-kwacha-gray-400 block mb-1">Card number (test values only)</label>
                  <input
                    className="kwacha-input font-mono"
                    placeholder="4242 4242 4242 4242"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={funding}
                  className="kwacha-btn-primary md:col-span-2 flex items-center justify-center gap-2"
                >
                  {funding && <Loader2 size={15} className="animate-spin" />}
                  {funding ? "Processing (simulated)…" : "Add funds (simulated)"}
                </button>
              </form>
            </section>

            <section className="kwacha-card p-5 mb-6">
              <h2 className="text-sm font-medium mb-4">Low Balance Protection</h2>
              <label className="flex items-center gap-2 text-sm text-kwacha-gray-300 mb-3">
                <input
                  type="checkbox"
                  checked={data.wallet.autoTopUpEnabled}
                  disabled={savingSettings}
                  onChange={(e) => updateAutoTopUp({ autoTopUpEnabled: e.target.checked })}
                />
                Automatically add funds when balance runs low
              </label>
              {data.wallet.autoTopUpEnabled && (
                <div className="grid md:grid-cols-2 gap-3 pl-6">
                  <div>
                    <label className="text-xs text-kwacha-gray-400 block mb-1">Top up when balance falls below</label>
                    <input
                      type="number"
                      className="kwacha-input"
                      defaultValue={data.wallet.autoTopUpThreshold}
                      onBlur={(e) => updateAutoTopUp({ autoTopUpThreshold: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-kwacha-gray-400 block mb-1">Add this amount</label>
                    <input
                      type="number"
                      className="kwacha-input"
                      defaultValue={data.wallet.autoTopUpAmount}
                      onBlur={(e) => updateAutoTopUp({ autoTopUpAmount: Number(e.target.value) })}
                    />
                  </div>
                </div>
              )}
              <p className="text-xs text-kwacha-gray-500 mt-3">
                If disabled, agents pause automatically once the balance reaches $0 rather than continuing to spend.
              </p>
            </section>

            <section className="kwacha-card p-5">
              <h2 className="text-sm font-medium mb-4">Recent transactions</h2>
              {data.recentTransactions.length === 0 ? (
                <p className="text-sm text-kwacha-gray-500">No transactions yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.recentTransactions.map((t) => (
                    <div key={t.id} className="flex justify-between text-sm border-b border-kwacha-gray-800 pb-2 last:border-0">
                      <div>
                        <div className="text-kwacha-gray-200">{t.type}</div>
                        <div className="text-xs text-kwacha-gray-500">{t.reference || t.provider || "—"}</div>
                      </div>
                      <div className="text-right">
                        <div className={t.type === "USAGE" ? "text-red-300" : "text-emerald-300"}>
                          {t.type === "USAGE" ? "-" : "+"}${t.amount.toFixed(2)}
                        </div>
                        <div className="text-xs text-kwacha-gray-500">{new Date(t.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
