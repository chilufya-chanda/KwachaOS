import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });

    const messages = await prisma.communicationMessage.findMany({
      where: { mission: { business: { workspaceId: member.workspaceId } } },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { mission: { select: { id: true, objective: true } } },
    });

    // Group into threads by contact — this is a unified inbox across
    // whichever channels are connected, per User Flow's Communication Inbox.
    const threads = new Map<string, { contactRef: string; channel: string; missionId: string; lastMessage: string; lastAt: string; status: string; unread: boolean }>();
    for (const m of messages) {
      const key = `${m.channel}:${m.contactRef}`;
      if (!threads.has(key)) {
        threads.set(key, {
          contactRef: m.contactRef,
          channel: m.channel,
          missionId: m.missionId,
          lastMessage: m.body,
          lastAt: m.createdAt.toISOString(),
          status: m.status,
          unread: m.direction === "inbound",
        });
      }
    }

    return NextResponse.json({ threads: Array.from(threads.values()) });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to load conversations." }, { status: 500 });
  }
}
