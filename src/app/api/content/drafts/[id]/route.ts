import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

async function ownedDraft(req: NextRequest, id: string) {
  const user = await requireUser(req);
  return prisma.contentDraft.findFirst({ where: { id, mission: { business: { workspace: { members: { some: { userId: user.id } } } } } } });
}

const schema = z.object({ body: z.string().min(1).max(4000).optional(), platform: z.string().max(40).optional() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const draft = await ownedDraft(req, params.id);
    if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    const body = schema.parse(await req.json());
    const updated = await prisma.contentDraft.update({ where: { id: draft.id }, data: body });
    return NextResponse.json({ draft: updated });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid draft update." }, { status: 400 });
    return NextResponse.json({ error: "Unable to update draft." }, { status: 500 });
  }
}
