"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useRequireAuth, authedFetch } from "@/lib/auth/client-guard";
import { getPlan } from "@/lib/billing/plans";

function PaymentForm() {
  const user = useRequireAuth();
  const router = useRouter();
  const params = useSearchParams();
  const workspaceId = params.get("workspaceId") ?? "";
  const tier = params.get("tier") ?? "lite";
  const plan = getPlan(tier);

  const [cardholder, setCardholder] = useState("Demo User");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("12/30");
  const [cvc, setCvc] = useState("123");
  const [stage, setStage] = useState<"idle" | "processing" | "authorized" | "declined">("idle");
  const [error, setError] = useState<string | null>(null);

  function useDemoCard() {
    setCardholder("Demo User");
    setCardNumber("4242 4242 4242 4242");
    setExpiry("12/30");
    setCvc("123");
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStage("processing");
    try {
      const res = await authedFetch("/api/billing/demo-payment", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          tier,
          cardholder,
          cardNumber: cardNumber.replace(/\s+/g, ""),
          expiry,
          cvc,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Payment could not be processed.");

      // Realistic processing delay so the simulated authorization step is
      // visible rather than instant.
      await new Promise((r) => setTimeout(r, 900));
      setStage(data.result);
      if (data.result === "authorized") {
        setTimeout(() => router.push("/onboarding/business"), 1200);
      }
    } catch (e: any) {
      setError(e.message);
      setStage("idle");
    }
  }

  if (!user || !plan) return null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="bg-kwacha-gold/10 border border-kwacha-gold/40 rounded-lg px-4 py-3 mb-6 flex gap-3">
          <ShieldAlert size={18} className="gold-text shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium gold-text">DEMO PAYMENT ENVIRONMENT</p>
            <p className="text-xs text-kwacha-gray-300">NO REAL MONEY WILL BE CHARGED</p>
          </div>
        </div>

        <h1 className="text-lg font-medium mb-1">
          Checkout — {plan.name}
        </h1>
        <p className="text-sm text-kwacha-gray-300 mb-6">
          {plan.demoPriceZmw ? `K${plan.demoPriceZmw}/mo, demo pricing` : "Free"}
        </p>

        {stage === "authorized" && (
          <div className="kwacha-card p-6 text-center">
            <CheckCircle2 className="gold-text mx-auto mb-3" size={28} />
            <p className="font-medium mb-1">Subscription activated</p>
            <p className="text-sm text-kwacha-gray-300">Simulated authorization succeeded.</p>
          </div>
        )}

        {stage === "declined" && (
          <div className="kwacha-card p-6 text-center mb-4">
            <XCircle className="text-red-400 mx-auto mb-3" size={28} />
            <p className="font-medium mb-1">Payment declined</p>
            <p className="text-sm text-kwacha-gray-300">
              Simulated decline. No real money was charged. Try the demo card below.
            </p>
          </div>
        )}

        {stage !== "authorized" && (
          <>
            {error && (
              <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button type="button" onClick={useDemoCard} className="kwacha-btn-secondary w-full mb-4 text-sm">
              Use Demo Card
            </button>

            <form onSubmit={handlePay} className="space-y-4">
              <div>
                <label className="text-xs text-kwacha-gray-300 block mb-1">Cardholder</label>
                <input
                  className="kwacha-input"
                  value={cardholder}
                  onChange={(e) => setCardholder(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-kwacha-gray-300 block mb-1">
                  Card number (test values only)
                </label>
                <input
                  className="kwacha-input font-mono"
                  placeholder="4242 4242 4242 4242"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-kwacha-gray-300 block mb-1">Expiry</label>
                  <input
                    className="kwacha-input font-mono"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-kwacha-gray-300 block mb-1">CVC</label>
                  <input
                    className="kwacha-input font-mono"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={stage === "processing"}
                className="kwacha-btn-primary w-full flex items-center justify-center gap-2"
              >
                {stage === "processing" && <Loader2 size={16} className="animate-spin" />}
                {stage === "processing" ? "Processing (simulated)…" : "Pay (Simulated)"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={null}>
      <PaymentForm />
    </Suspense>
  );
}
