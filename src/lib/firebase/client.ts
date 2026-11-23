"use client";

import { initializeApp, getApps, getApp } from "firebase/app";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app =
  getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig);

export const auth = getAuth(app);

async function syncWithKwacha(user: FirebaseUser) {
  const idToken = await user.getIdToken(true);

  const response = await fetch("/api/auth/sync", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    console.error("Kwacha authentication sync failed:", data);

    throw new Error(
      data?.error || "Unable to synchronize your Kwacha account."
    );
  }

  return response.json();
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: "select_account",
  });

  const result = await signInWithPopup(auth, provider);

  await syncWithKwacha(result.user);

  return result;
}

export async function signUpWithEmail(
  email: string,
  password: string
) {
  const result = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  await syncWithKwacha(result.user);

  return result;
}

export async function signInWithEmail(
  email: string,
  password: string
) {
  const result = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  await syncWithKwacha(result.user);

  return result;
}

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export async function signOut() {
  return firebaseSignOut(auth);
}

export function watchAuthState(
  callback: (user: FirebaseUser | null) => void
) {
  return onAuthStateChanged(auth, callback);
}

export function friendlyAuthError(code: string): string {
  const map: Record<string, string> = {
    "auth/invalid-credential":
      "That email or password isn't right.",

    "auth/wrong-password":
      "That email or password isn't right.",

    "auth/user-not-found":
      "That email or password isn't right.",

    "auth/email-already-in-use":
      "An account with that email already exists.",

    "auth/weak-password":
      "Choose a password with at least 6 characters.",

    "auth/popup-closed-by-user":
      "Google sign-in was cancelled.",

    "auth/popup-blocked":
      "Your browser blocked the sign-in popup. Allow popups and try again.",

    "auth/network-request-failed":
      "Network error. Check your connection and try again.",

    "auth/user-disabled":
      "This account has been disabled.",

    "auth/too-many-requests":
      "Too many attempts. Please wait a moment and try again.",

    "auth/invalid-api-key":
      "The Firebase configuration is invalid.",

    "auth/operation-not-allowed":
      "This sign-in method has not been enabled in Firebase.",
  };

  return (
    map[code] ??
    "Something went wrong. Please try again."
  );
}