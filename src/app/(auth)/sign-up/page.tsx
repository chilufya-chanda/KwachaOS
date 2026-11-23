"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateProfile } from "firebase/auth";
import { signInWithGoogle, signUpWithEmail, friendlyAuthError } from "@/lib/firebase/client";

async function syncAndRedirect(router: ReturnType<typeof useRouter>, idToken: string) {
  await fetch("/api/auth/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  router.push("/onboarding/verify");
}

function passwordIssue(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  return null;
}

export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
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

  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    const issue = passwordIssue(password);
    if (issue) {
      setError(issue);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!acceptedTerms) {
      setError("Please accept the Terms of Service to continue.");
      return;
    }

    setLoading(true);
    try {
      const cred = await signUpWithEmail(email, password);
      await updateProfile(cred.user, { displayName: fullName.trim() });
      // Force-refresh so the ID token's "name" claim reflects the profile
      // we just set, before /api/auth/sync reads it server-side.
      const idToken = await cred.user.getIdToken(true);
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
        <h1 className="text-xl font-medium mb-6 text-center">Create your Kwacha account</h1>

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
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-px bg-kwacha-gray-700 flex-1" />
          <span className="text-xs text-kwacha-gray-500">OR</span>
          <div className="h-px bg-kwacha-gray-700 flex-1" />
        </div>

        <form onSubmit={handleEmailSignUp} className="space-y-4">
          <div>
            <label className="text-xs text-kwacha-gray-300 block mb-1">Full name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="kwacha-input"
            />
          </div>
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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="kwacha-input"
            />
          </div>
          <div>
            <label className="text-xs text-kwacha-gray-300 block mb-1">Confirm password</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="kwacha-input"
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-kwacha-gray-300">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5"
            />
            I agree to the Terms of Service and Privacy Policy.
          </label>

          <button type="submit" disabled={loading} className="kwacha-btn-primary w-full">
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm mt-6">
          <span className="text-kwacha-gray-300">Already have an account? </span>
          <Link href="/sign-in" className="gold-text hover:text-kwacha-gold-bright">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
