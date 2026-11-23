import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

async function ownedItem(req: NextRequest, id: string) {
  const user = await requireUser(req);
  const item = await prisma.businessKnowledge.findFirst({ where: { id, business: { workspace: { members: { some: { userId: user.id } } } } } });
  return item;
}

const schema = z.object({
  title: z.string().min(1).max(160).optional(),
  content: z.string().min(1).max(8000).optional(),
  status: z.enum(["pending_review", "approved"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const item = await ownedItem(req, params.id);
    if (!item) return NextResponse.json({ error: "Knowledge item not found." }, { status: 404 });
    const body = schema.parse(await req.json());
    const updated = await prisma.businessKnowledge.update({ where: { id: item.id }, data: body });
    return NextResponse.json({ item: updated });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid update." }, { status: 400 });
    return NextResponse.json({ error: "Unable to update knowledge item." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const item = await ownedItem(req, params.id);
    if (!item) return NextResponse.json({ error: "Knowledge item not found." }, { status: 404 });
    await prisma.businessKnowledge.delete({ where: { id: item.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to delete knowledge item." }, { status: 500 });
  }
}
