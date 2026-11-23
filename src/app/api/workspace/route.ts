import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

const schema = z.object({
  name: z.string().min(2).max(80),
  type: z.enum(["personal", "business", "developer", "organization"]),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = schema.parse(await req.json());

    const existing = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (existing) {
      return NextResponse.json({ error: "You already have a workspace." }, { status: 409 });
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: body.name,
        type: body.type,
        ownerId: user.id,
        members: { create: { userId: user.id, role: "owner" } },
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { onboardingStatus: "workspace_created" },
    });

    return NextResponse.json({ workspace });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Please fill in a valid workspace name and type." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
