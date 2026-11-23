import { prisma } from "@/lib/database/prisma";

/**
 * Model Cost Engine — Internal Ops/BI/Finance Architecture #13.
 *
 * "Do not hard-code model prices throughout the application. Create a
 * central pricing table. When provider pricing changes, create a new
 * pricing version." This file is the one place that reads that table;
 * nothing else in the app should reference a price directly.
 */

export type UsageQuantities = {
  inputUnits?: number;
  outputUnits?: number;
  cachedUnits?: number;
  imageUnits?: number;
  videoSeconds?: number;
  audioSeconds?: number;
};

export type PriceRow = {
  inputPrice: number;
  outputPrice: number;
  cachedInputPrice: number;
  imagePrice: number;
  videoPrice: number;
  audioPrice: number;
  currency: string;
  unit: string;
};

export class PricingNotConfiguredError extends Error {}

/** Looks up the pricing version in effect right now for a provider/model. */
export async function getCurrentPrice(provider: string, model: string): Promise<PriceRow> {
  const row = await prisma.modelPrice.findFirst({
    where: {
      provider,
      model,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: new Date() } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!row) {
    throw new PricingNotConfiguredError(
      `No pricing configured for ${provider}/${model}. Add a row to ModelPrice (see prisma/seed.ts) before this operation can be billed.`
    );
  }
  return row;
}

/**
 * How much markup Kwacha OS adds over the raw provider cost. This is a
 * business decision, not a technical one — kept as a single named
 * constant (overridable via env) rather than scattered magic numbers, per
 * the "do not hard-code prices throughout the application" rule.
 */
export function getMarkupMultiplier(): number {
  const raw = process.env.AI_USAGE_MARKUP_MULTIPLIER;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1.4; // default: 40% margin over provider cost
}

/** Computes provider cost and customer charge for a unit of usage, per-1000-unit pricing. */
export function computeCost(price: PriceRow, usage: UsageQuantities): { providerCost: number; customerCharge: number } {
  const per1000 = (qty: number | undefined, unitPrice: number) => ((qty || 0) / 1000) * unitPrice;
  const providerCost =
    per1000(usage.inputUnits, price.inputPrice) +
    per1000(usage.outputUnits, price.outputPrice) +
    per1000(usage.cachedUnits, price.cachedInputPrice) +
    per1000(usage.imageUnits, price.imagePrice) +
    per1000(usage.videoSeconds, price.videoPrice) +
    per1000(usage.audioSeconds, price.audioPrice);
  const customerCharge = providerCost * getMarkupMultiplier();
  return { providerCost: round(providerCost), customerCharge: round(customerCharge) };
}

function round(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000; // sub-cent precision; wallet balances are small dollar amounts
}
