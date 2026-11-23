import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase/admin";
import { prisma } from "@/lib/database/prisma";

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authentication token." },
        { status: 401 }
      );
    }

    const idToken = authorization.substring(7).trim();

    if (!idToken) {
      return NextResponse.json(
        { error: "Missing authentication token." },
        { status: 401 }
      );
    }

    const decoded = await verifyIdToken(idToken);

    if (!decoded.uid) {
      return NextResponse.json(
        { error: "Invalid Firebase account." },
        { status: 401 }
      );
    }

    const email = decoded.email ?? "";
    const displayName =
      decoded.name ||
      (email ? email.split("@")[0] : "Kwacha User");

    const user = await prisma.user.upsert({
      where: {
        firebaseUid: decoded.uid,
      },

      update: {
        email,
        displayName,
        photoUrl: decoded.picture ?? null,
      },

      create: {
        firebaseUid: decoded.uid,
        email,
        displayName,
        photoUrl: decoded.picture ?? null,
        role: "business_user",
        subscriptionTier: "none",
        onboardingStatus: "account_created",
      },
    });

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("====================================");
    console.error("KWACHA AUTH SYNC ERROR");
    console.error(error);
    console.error("====================================");

    return NextResponse.json(
      {
        error: "Unable to synchronize your Kwacha account.",
      },
      { status: 401 }
    );
  }
}