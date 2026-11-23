import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { publishToPlatformReal } from "@/lib/tools/registry";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const draft = await prisma.contentDraft.findFirst({ where: { id: params.id, mission: { business: { workspace: { members: { some: { userId: user.id } } } } } } });
    if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

    // A human explicitly clicking Publish here IS the approval — this
    // bypasses the Permission Center gate that governs autonomous agent
    // tool calls, since that gate exists to require a human in the loop,
    // and a human is directly the one acting.
    const result = await publishToPlatformReal(draft.missionId, draft.platform, draft.body);
    if (result.ok) {
      await prisma.contentDraft.update({ where: { id: draft.id }, data: { status: "published" } });
    }
    await prisma.activityLog.create({ data: { missionId: draft.missionId, actor: "human", message: `Human published draft to ${draft.platform}: ${result.ok ? "success" : "failed — " + result.message}` } });

    return NextResponse.json({ result });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to publish." }, { status: 500 });
  }
}
