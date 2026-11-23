"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithGoogle, signInWithEmail, friendlyAuthError } from "@/lib/firebase/client";
import { nextStepPath } from "@/lib/onboarding/next-step";

async function syncAndRedirect(router: ReturnType<typeof useRouter>, idToken: string) {
  await fetch("/api/auth/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const me = await fetch("/api/me", { headers: { Authorization: `Bearer ${idToken}` } }).then((r) =>
    r.json()
  );
  router.push(nextStepPath(me));
}

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithGoogle();
      const idToken = await cred.user.getIdToken();
      await syncAndRedirect(router, idToken);
    } catch (e: any) {
      setError(friendlyAuthError(e?.code ?? ""));
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithEmail(email, password);
      const idToken = await cred.user.getIdToken();
      await syncAndRedirect(router, idToken);
    } catch (e: any) {
      setError(friendlyAuthError(e?.code ?? ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <p className="text-sm tracking-widest text-kwacha-gray-300">KWACHA OS</p>
          <p className="text-xs text-kwacha-gray-500 mt-1">
            The Autonomous Operating System for AI Agents
          </p>
        </div>

        <h1 className="text-xl font-medium mb-1">Welcome back</h1>
        <p className="text-sm text-kwacha-gray-300 mb-6">Sign in to continue to your workspace.</p>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="kwacha-btn-secondary w-full flex items-center justify-center gap-2 mb-6"
        >
          <GoogleG /> Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-px bg-kwacha-gray-700 flex-1" />
          <span className="text-xs text-kwacha-gray-500">OR</span>
          <div className="h-px bg-kwacha-gray-700 flex-1" />
        </div>

        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <div>
            <label className="text-xs text-kwacha-gray-300 block mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="kwacha-input"
            />
          </div>
          <div>
            <label className="text-xs text-kwacha-gray-300 block mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="kwacha-input"
            />
          </div>
          <button type="submit" disabled={loading} className="kwacha-btn-primary w-full">
            Sign In
          </button>
        </form>

        <div className="flex items-center justify-between mt-6 text-sm">
          <Link href="/reset-password" className="text-kwacha-gray-300 hover:text-white">
            Forgot password?
          </Link>
          <Link href="/sign-up" className="gold-text hover:text-kwacha-gold-bright">
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.9 32.9 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.4 0-13.8 4.1-17.1 10.1z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.4 0 10.3-2.1 13.9-5.5l-6.4-5.4C29.4 34.7 26.9 35.5 24 35.5c-5.3 0-9.8-3.1-11.4-7.7l-6.5 5C9.1 39.6 16 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1 3.1-3.4 5.5-6.4 6.9l6.4 5.4C38.6 37.8 44 32.4 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}
