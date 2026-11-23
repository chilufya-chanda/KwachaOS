import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { sendWhatsAppReal } from "@/lib/tools/registry";

const schema = z.object({ body: z.string().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: { contactRef: string } }) {
  try {
    const user = await requireUser(req);
    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });

    const contactRef = decodeURIComponent(params.contactRef);
    const { body } = schema.parse(await req.json());

    const lastMessage = await prisma.communicationMessage.findFirst({
      where: { contactRef, mission: { business: { workspaceId: member.workspaceId } } },
      orderBy: { createdAt: "desc" },
    });
    if (!lastMessage) return NextResponse.json({ error: "No existing conversation with this contact." }, { status: 404 });

    // Human is taking over — this is the exact same real send path the
    // Communication Agent uses, just triggered by a person instead of the
    // model, matching "Human can intervene" in the spec.
    const result = await sendWhatsAppReal(lastMessage.missionId, contactRef, body);
    await prisma.activityLog.create({ data: { missionId: lastMessage.missionId, actor: "human", message: `Human replied to ${contactRef}: ${result.ok ? "sent" : "failed — " + result.message}` } });

    return NextResponse.json({ result });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Message body is required." }, { status: 400 });
    return NextResponse.json({ error: "Unable to send reply." }, { status: 500 });
  }
}
