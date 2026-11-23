import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      include: {
        workspace: {
          include: {
            subscription: true,
            businesses: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      user,
      workspace: membership?.workspace ?? null,
      subscription: membership?.workspace.subscription ?? null,
      business: membership?.workspace.businesses[0] ?? null,
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
