import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

async function getWorkspaceId(req: NextRequest) {
  const user = await requireUser(req);
  const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!member) throw new Error("No workspace found for this account.");
  return member.workspaceId;
}

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId(req);
    const policy = await prisma.communicationPolicy.upsert({ where: { workspaceId }, update: {}, create: { workspaceId } });
    return NextResponse.json({ policy });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message || "Unable to load communication policy." }, { status: 500 });
  }
}

const schema = z.object({
  mode: z.enum(["draft_only", "auto_simple", "auto_simple_and_qualify", "full_auto_with_escalation"]).optional(),
  escalateComplex: z.boolean().optional(),
  escalateRefund: z.boolean().optional(),
  escalateLegal: z.boolean().optional(),
  businessHours: z.string().max(200).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId(req);
    const body = schema.parse(await req.json());
    const policy = await prisma.communicationPolicy.upsert({ where: { workspaceId }, create: { workspaceId, ...body }, update: body });
    return NextResponse.json({ policy });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid communication policy." }, { status: 400 });
    return NextResponse.json({ error: e.message || "Unable to update communication policy." }, { status: 500 });
  }
}
