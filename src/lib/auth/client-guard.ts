"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, watchAuthState } from "@/lib/firebase/client";
import type { User as FirebaseUser } from "firebase/auth";

export function useRequireAuth(): FirebaseUser | null {
  const router = useRouter();

  const [user, setUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsubscribe = watchAuthState((firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        router.replace("/sign-in");
        return;
      }

      setUser(firebaseUser);
    });

    return unsubscribe;
  }, [router]);

  return user;
}

export async function authedFetch(
  path: string,
  init: RequestInit = {}
) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Not signed in.");
  }

  const idToken = await currentUser.getIdToken(true);

  const headers = new Headers(init.headers);

  headers.set("Authorization", `Bearer ${idToken}`);

  const isFormData =
    typeof FormData !== "undefined" &&
    init.body instanceof FormData;

  if (init.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, {
    ...init,
    headers,
  });
}