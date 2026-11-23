import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

const schema = z.object({
  workspaceId: z.string(),
  name: z.string().min(2).max(120),
  industry: z.string().optional(),
  location: z.string().optional(),
  description: z.string().max(2000).optional(),
  mainGoal: z.enum([
    "generate_leads",
    "increase_sales",
    "improve_marketing",
    "research_markets",
    "automate_support",
    "analyze_performance",
    "create_content",
    "other",
  ]),
  targetCustomers: z.string().optional(),
  availableBudget: z.number().nonnegative().optional(),
  currency: z.string().default("ZMW"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = schema.parse(await req.json());

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: body.workspaceId, userId: user.id } },
      include: { workspace: { include: { subscription: true } } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
    if (membership.workspace.subscription?.status !== "demo_active") {
      return NextResponse.json(
        { error: "Activate a subscription before setting up your business." },
        { status: 403 }
      );
    }

    const business = await prisma.business.create({
      data: {
        workspaceId: body.workspaceId,
        name: body.name,
        industry: body.industry,
        location: body.location,
        description: body.description,
        mainGoal: body.mainGoal,
        targetCustomers: body.targetCustomers,
        availableBudget: body.availableBudget,
        currency: body.currency,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { onboardingStatus: "onboarding_complete" },
    });

    return NextResponse.json({ business });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Please fill in the required business details." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
