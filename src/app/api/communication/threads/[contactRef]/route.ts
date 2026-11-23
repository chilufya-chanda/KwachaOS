import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

export async function GET(req: NextRequest, { params }: { params: { contactRef: string } }) {
  try {
    const user = await requireUser(req);
    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });

    const contactRef = decodeURIComponent(params.contactRef);
    const messages = await prisma.communicationMessage.findMany({
      where: { contactRef, mission: { business: { workspaceId: member.workspaceId } } },
      orderBy: { createdAt: "asc" },
    });
    if (!messages.length) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

    return NextResponse.json({ messages, missionId: messages[messages.length - 1].missionId });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to load conversation." }, { status: 500 });
  }
}
