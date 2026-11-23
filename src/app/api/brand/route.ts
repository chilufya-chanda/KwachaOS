import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

async function getBusiness(req: NextRequest) {
  const user = await requireUser(req);
  const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!member) throw new Error("No workspace found for this account.");
  const business = await prisma.business.findFirst({ where: { workspaceId: member.workspaceId } });
  if (!business) throw new Error("No business profile found for this workspace yet.");
  return business;
}

export async function GET(req: NextRequest) {
  try {
    const business = await getBusiness(req);
    const profile = await prisma.brandProfile.upsert({ where: { businessId: business.id }, update: {}, create: { businessId: business.id } });
    return NextResponse.json({ profile });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message || "Unable to load brand profile." }, { status: 500 });
  }
}

const schema = z.object({
  brandName: z.string().max(120).optional(),
  tone: z.string().max(200).optional(),
  language: z.string().max(60).optional(),
  wordsToUse: z.string().max(500).optional(),
  wordsToAvoid: z.string().max(500).optional(),
  emojiPreference: z.enum(["none", "minimal", "frequent"]).optional(),
  style: z.enum(["short_and_clear", "detailed", "formal", "casual"]).optional(),
  ctaStyle: z.string().max(200).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const business = await getBusiness(req);
    const body = schema.parse(await req.json());
    const profile = await prisma.brandProfile.upsert({ where: { businessId: business.id }, create: { businessId: business.id, ...body }, update: body });
    return NextResponse.json({ profile });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid brand profile." }, { status: 400 });
    return NextResponse.json({ error: e.message || "Unable to update brand profile." }, { status: 500 });
  }
}
