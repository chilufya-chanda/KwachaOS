import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

const CATEGORIES = ["about", "products", "services", "prices", "faqs", "policies", "hours", "locations", "delivery", "refund", "contact", "promotions", "brand_voice", "other"] as const;

async function getBusiness(req: NextRequest) {
  const user = await requireUser(req);
  const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!member) throw new Error("No workspace found for this account.");
  const business = await prisma.business.findFirst({ where: { workspaceId: member.workspaceId } });
  if (!business) throw new Error("No business profile found for this workspace yet.");
  return { workspaceId: member.workspaceId, business };
}

export async function GET(req: NextRequest) {
  try {
    const { business } = await getBusiness(req);
    const items = await prisma.businessKnowledge.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ items });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message || "Unable to load business knowledge." }, { status: 500 });
  }
}

const schema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().min(1).max(160),
  content: z.string().min(1).max(8000),
});

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, business } = await getBusiness(req);
    const body = schema.parse(await req.json());
    const item = await prisma.businessKnowledge.create({
      data: { businessId: business.id, workspaceId, source: "manual", category: body.category, title: body.title, content: body.content, status: "approved" },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Please check the knowledge entry fields." }, { status: 400 });
    return NextResponse.json({ error: e.message || "Unable to save knowledge entry." }, { status: 500 });
  }
}
