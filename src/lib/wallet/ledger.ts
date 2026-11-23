import { prisma } from "@/lib/database/prisma";
import { getCurrentPrice, computeCost, UsageQuantities } from "@/lib/ai/pricing";

/**
 * Agent Wallet Accounting (#9) + Wallet Ledger (#10).
 *
 * Every balance change is an immutable WalletTransaction row plus a
 * balance update, done in one atomic Prisma transaction so the ledger and
 * the cached `Wallet.balance` can never drift apart. Never update or
 * delete a posted row — corrections are new rows (REFUND/ADJUSTMENT/
 * CHARGEBACK) that reference the original.
 */

export type WalletTxType = "DEPOSIT" | "USAGE" | "REFUND" | "CREDIT" | "ADJUSTMENT" | "CHARGEBACK" | "EXPIRATION";

const INCREASES_BALANCE: Set<WalletTxType> = new Set(["DEPOSIT", "REFUND", "CREDIT", "ADJUSTMENT"]);
const DECREASES_BALANCE: Set<WalletTxType> = new Set(["USAGE", "CHARGEBACK", "EXPIRATION"]);

export class InsufficientBalanceError extends Error {}

export async function getOrCreateWallet(workspaceId: string) {
  const existing = await prisma.wallet.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  return prisma.wallet.create({ data: { workspaceId } });
}

/**
 * Posts one ledger entry and updates the wallet balance atomically.
 * `amount` is always given as a positive number — direction comes from
 * `type`. ADJUSTMENT can go either way via `direction` (defaults to increase).
 */
async function postTransaction(params: {
  workspaceId: string;
  type: WalletTxType;
  amount: number;
  currency?: string;
  agentId?: string | null;
  provider?: string | null;
  usageEventId?: string | null;
  reference?: string | null;
  direction?: "increase" | "decrease";
  allowNegative?: boolean;
}) {
  if (params.amount < 0) throw new Error("Ledger amount must be non-negative; direction is implied by type.");

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { workspaceId: params.workspaceId },
      update: {},
      create: { workspaceId: params.workspaceId },
    });

    let increases = INCREASES_BALANCE.has(params.type);
    if (params.type === "ADJUSTMENT" && params.direction) increases = params.direction === "increase";
    if (params.type !== "ADJUSTMENT" && DECREASES_BALANCE.has(params.type)) increases = false;

    const balanceBefore = wallet.balance;
    const balanceAfter = increases ? balanceBefore + params.amount : balanceBefore - params.amount;

    if (!increases && balanceAfter < 0 && !params.allowNegative) {
      throw new InsufficientBalanceError(
        `Insufficient wallet balance: have $${balanceBefore.toFixed(2)}, need $${params.amount.toFixed(2)}.`
      );
    }

    const updatedWallet = await tx.wallet.update({
      where: { workspaceId: params.workspaceId },
      data: { balance: balanceAfter },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        workspaceId: params.workspaceId,
        type: params.type,
        amount: params.amount,
        currency: params.currency || wallet.currency,
        balanceBefore,
        balanceAfter,
        agentId: params.agentId || null,
        provider: params.provider || null,
        usageEventId: params.usageEventId || null,
        reference: params.reference || null,
      },
    });

    return { wallet: updatedWallet, transaction };
  });
}

/** Stage 10 / Low Balance Protection "Add Funds" — simulated deposit only, no real gateway. */
export async function deposit(workspaceId: string, amount: number, reference: string) {
  if (amount <= 0) throw new Error("Deposit amount must be positive.");
  return postTransaction({ workspaceId, type: "DEPOSIT", amount, reference });
}

export async function refund(workspaceId: string, amount: number, reference: string) {
  if (amount <= 0) throw new Error("Refund amount must be positive.");
  return postTransaction({ workspaceId, type: "REFUND", amount, reference });
}

export async function creditGrant(workspaceId: string, amount: number, reference: string) {
  if (amount <= 0) throw new Error("Credit amount must be positive.");
  return postTransaction({ workspaceId, type: "CREDIT", amount, reference });
}

export async function chargeback(workspaceId: string, amount: number, reference: string) {
  if (amount <= 0) throw new Error("Chargeback amount must be positive.");
  return postTransaction({ workspaceId, type: "CHARGEBACK", amount, reference, allowNegative: true });
}

export async function adjustment(workspaceId: string, amount: number, direction: "increase" | "decrease", reference: string) {
  if (amount <= 0) throw new Error("Adjustment amount must be positive.");
  return postTransaction({ workspaceId, type: "ADJUSTMENT", amount, direction, reference, allowNegative: direction === "decrease" });
}

/**
 * AI Cost Tracking (#11) + AI Usage Ledger (#12) + Agent Wallet Accounting.
 * Records the usage event, prices it from the current ModelPrice version,
 * and charges the wallet for the customer-facing amount — all as one
 * operation, matching "every AI operation should create a usage record."
 *
 * Throws InsufficientBalanceError if the wallet can't cover the charge —
 * callers should catch this and pause the mission / trigger Low Balance
 * Protection rather than silently letting the balance go negative
 * ("never silently charge unless auto top-up was explicitly enabled").
 */
export async function chargeUsage(params: {
  workspaceId: string;
  agentId?: string | null;
  provider: string;
  model: string;
  operation: string;
  usage: UsageQuantities;
  taskId?: string | null;
  businessId?: string | null;
  userId?: string | null;
}) {
  const price = await getCurrentPrice(params.provider, params.model);
  const { providerCost, customerCharge } = computeCost(price, params.usage);

  const usageEvent = await prisma.aiUsageEvent.create({
    data: {
      workspaceId: params.workspaceId,
      businessId: params.businessId,
      userId: params.userId,
      agentId: params.agentId,
      taskId: params.taskId,
      provider: params.provider,
      model: params.model,
      operation: params.operation,
      inputUnits: params.usage.inputUnits || 0,
      outputUnits: params.usage.outputUnits || 0,
      cachedUnits: params.usage.cachedUnits || 0,
      imageUnits: params.usage.imageUnits || 0,
      videoSeconds: params.usage.videoSeconds || 0,
      audioSeconds: params.usage.audioSeconds || 0,
      providerCost,
      customerCharge,
      currency: price.currency,
    },
  });

  try {
    const result = await postTransaction({
      workspaceId: params.workspaceId,
      type: "USAGE",
      amount: customerCharge,
      currency: price.currency,
      agentId: params.agentId,
      provider: params.provider,
      usageEventId: usageEvent.id,
      reference: `${params.operation} (${params.provider}/${params.model})`,
    });
    return { usageEvent, ...result };
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      await prisma.aiUsageEvent.update({ where: { id: usageEvent.id }, data: { status: "failed" } });
    }
    throw e;
  }
}

/** Agent Wallet dashboard summary (Stage "Agent Wallet"). */
export async function getWalletSummary(workspaceId: string) {
  const wallet = await getOrCreateWallet(workspaceId);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usageThisMonth = await prisma.walletTransaction.findMany({
    where: { workspaceId, type: "USAGE", createdAt: { gte: startOfMonth } },
    include: { usageEvent: true },
  });

  const usedThisMonth = usageThisMonth.reduce((sum, t) => sum + t.amount, 0);

  const byCategory = new Map<string, number>();
  for (const t of usageThisMonth) {
    const category = categorize(t.usageEvent?.operation, t.usageEvent?.provider);
    byCategory.set(category, (byCategory.get(category) || 0) + t.amount);
  }

  return {
    wallet,
    usedThisMonth: round2(usedThisMonth),
    usageByCategory: Object.fromEntries([...byCategory.entries()].map(([k, v]) => [k, round2(v)])),
  };
}

function categorize(operation?: string | null, provider?: string | null): string {
  const s = `${operation || ""} ${provider || ""}`.toLowerCase();
  if (s.includes("image")) return "Images";
  if (s.includes("video")) return "Video";
  if (s.includes("voice") || s.includes("audio") || s.includes("speech")) return "Voice";
  if (s.includes("research") || s.includes("search")) return "Research";
  return "Text AI";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
