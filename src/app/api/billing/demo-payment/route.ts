import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { getPlan } from "@/lib/billing/plans";

const schema = z.object({
  workspaceId: z.string(),
  tier: z.enum(["lite", "pro", "max", "enterprise"]),
  cardNumber: z.string().min(12).max(19),
  expiry: z.string(),
  cvc: z.string().min(3).max(4),
  cardholder: z.string().min(2),
});

// Well-known DEMO/TEST card numbers only. This endpoint never accepts or
// forwards a real PAN to any payment processor — see Sections 12 & 79.
const TEST_AUTHORIZE = "4242424242424242";
const TEST_DECLINE = "4000000000000002";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = schema.parse(await req.json());

    if (body.tier === "enterprise") {
      return NextResponse.json(
        { error: "Enterprise plans are arranged by sales, not self-serve checkout." },
        { status: 400 }
      );
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: body.workspaceId, userId: user.id } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    const plan = getPlan(body.tier)!;
    const digits = body.cardNumber.replace(/\s+/g, "");
    const last4 = digits.slice(-4);

    let result: "authorized" | "declined" = "declined";
    if (digits === TEST_AUTHORIZE) result = "authorized";
    else if (digits === TEST_DECLINE) result = "declined";
    else result = "declined"; // unrecognized test number — fail closed, never guess

    const subscription = await prisma.subscription.upsert({
      where: { workspaceId: body.workspaceId },
      update: { tier: body.tier, status: "pending_payment" },
      create: { workspaceId: body.workspaceId, tier: body.tier, status: "pending_payment" },
    });

    const payment = await prisma.demoPayment.create({
      data: {
        subscriptionId: subscription.id,
        tier: body.tier,
        amount: plan.demoPriceZmw ?? 0,
        currency: "ZMW",
        cardLast4: last4,
        result,
        isSimulated: true,
      },
    });

    if (result === "authorized") {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: "demo_active", demoPaymentRef: payment.id },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { onboardingStatus: "subscription_active" },
      });
    }

    return NextResponse.json({
      result,
      isSimulated: true,
      message:
        result === "authorized"
          ? "DEMO PAYMENT ENVIRONMENT — simulated authorization succeeded. No real money was charged."
          : "DEMO PAYMENT ENVIRONMENT — simulated authorization declined. No real money was charged.",
      payment,
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Please check the payment details." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
