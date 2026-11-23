"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRequireAuth } from "@/lib/auth/client-guard";
import { CheckCircle2, Mail } from "lucide-react";

export default function VerifyPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const [sent, setSent] = useState(false);

  async function sendReal() {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setSent(true);
    } catch {
      setSent(true); // demo environment may have no email quota configured
    }
  }

  if (!user) return null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <Mail className="gold-text mx-auto mb-4" size={32} />
        <h1 className="text-xl font-medium mb-2">Verify your account</h1>
        <p className="text-sm text-kwacha-gray-300 mb-8">
          We'd normally send a verification link to <strong>{user.email}</strong>.
        </p>

        <div className="kwacha-card p-4 mb-6 text-left">
          <p className="text-xs uppercase tracking-wide gold-text mb-2">Demo / development mode</p>
          <p className="text-sm text-kwacha-gray-300">
            This prototype isn't wired to a production email delivery service, so verification
            can't block your progress here. You can still trigger a real Firebase verification
            email below if your project has one configured.
          </p>
        </div>

        {!sent ? (
          <button onClick={sendReal} className="kwacha-btn-secondary w-full mb-4">
            Send real verification email
          </button>
        ) : (
          <p className="text-sm text-kwacha-gray-300 mb-4 flex items-center justify-center gap-2">
            <CheckCircle2 size={16} className="gold-text" /> Check your inbox if you'd like to
            verify — you can continue either way.
          </p>
        )}

        <button
          onClick={() => router.push("/onboarding/workspace")}
          className="kwacha-btn-primary w-full"
        >
          Continue to Kwacha OS
        </button>
      </div>
    </main>
  );
}
