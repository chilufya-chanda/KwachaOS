import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { deposit } from "@/lib/wallet/ledger";

const schema = z.object({
  amount: z.number().min(1).max(1000),
  cardNumber: z.string().min(12).max(19),
  expiry: z.string(),
  cvc: z.string().min(3).max(4),
  cardholder: z.string().min(2),
});

// Same well-known DEMO/TEST card numbers as billing/demo-payment — this
// endpoint never accepts or forwards a real PAN to any payment processor.
// Per the current build's scope, the payment gateway stays simulated.
const TEST_AUTHORIZE = "4242424242424242";
const TEST_DECLINE = "4000000000000002";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = schema.parse(await req.json());

    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });

    const digits = body.cardNumber.replace(/\s+/g, "");
    const last4 = digits.slice(-4);
    const authorized = digits === TEST_AUTHORIZE; // unrecognized numbers fail closed, same as demo-payment

    if (!authorized) {
      return NextResponse.json({
        result: "declined",
        isSimulated: true,
        message: "DEMO PAYMENT ENVIRONMENT — simulated authorization declined. No real money was charged.",
      });
    }

    const { wallet, transaction } = await deposit(member.workspaceId, body.amount, `demo-card:${last4}`);

    return NextResponse.json({
      result: "authorized",
      isSimulated: true,
      message: "DEMO PAYMENT ENVIRONMENT — simulated authorization succeeded. No real money was charged.",
      wallet,
      transaction,
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Please check the payment details." }, { status: 400 });
    return NextResponse.json({ error: "Unable to fund the wallet." }, { status: 500 });
  }
}
