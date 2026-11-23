import { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebase/admin";
import { prisma } from "@/lib/database/prisma";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    throw new AuthError("Missing authentication token.", 401);
  }

  const idToken = authHeader.slice(7).trim();

  if (!idToken) {
    throw new AuthError("Missing authentication token.", 401);
  }

  let decoded;

  try {
    decoded = await verifyIdToken(idToken);
  } catch (error) {
    console.error("FIREBASE TOKEN VERIFICATION ERROR:", error);

    throw new AuthError(
      "Your authentication session is invalid. Please sign in again.",
      401
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      firebaseUid: decoded.uid,
    },
  });

  if (!user) {
    throw new AuthError(
      "No Kwacha profile found for this account.",
      404
    );
  }

  return user;
}

export async function requireAdmin(req: NextRequest) {
  const user = await requireUser(req);

  if (user.role !== "admin") {
    throw new AuthError("Admin access required.", 403);
  }

  return user;
}