import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { recordAdminAudit } from "@/lib/admin";

/**
 * Real Business Intelligence, scoped to what's actually computable from
 * real data in this build. Deliberately does NOT include MRR, churn,
 * retention, customer acquisition cost, cash flow, hosting cost, provider
 * dependency, queue/webhook monitoring, or fraud detection — those need
 * either a real multi-customer base or real infrastructure (queues,
 * webhooks receiving live traffic, multiple redundant providers) that
 * doesn't exist in this build. Building charts for those would mean
 * fabricating numbers, which is exactly the mistake already found and
 * fixed elsewhere in this codebase — not repeating it here.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [wallets, usageThisMonth, usageAllTime, agents, tasksByAgent] = await Promise.all([
      prisma.wallet.aggregate({ _sum: { balance: true }, _count: true }),
      prisma.aiUsageEvent.findMany({ where: { createdAt: { gte: startOfMonth } }, select: { provider: true, model: true, agentId: true, providerCost: true, customerCharge: true } }),
      prisma.aiUsageEvent.aggregate({ _sum: { providerCost: true, customerCharge: true }, _count: true }),
      prisma.agent.findMany({ select: { id: true, key: true, name: true } }),
      prisma.agentTask.groupBy({ by: ["agentId", "status"], _count: true }),
    ]);

    const providerCostThisMonth = usageThisMonth.reduce((n, u) => n + u.providerCost, 0);
    const customerChargeThisMonth = usageThisMonth.reduce((n, u) => n + u.customerCharge, 0);
    const marginThisMonth = customerChargeThisMonth - providerCostThisMonth;
    const marginPct = customerChargeThisMonth > 0 ? (marginThisMonth / customerChargeThisMonth) * 100 : 0;

    // Agent Profitability (#14) — real cost attribution per agent.
    const agentNameById = new Map(agents.map((a) => [a.id, a.name]));
    const costByAgent = new Map<string, { providerCost: number; customerCharge: number; calls: number }>();
    for (const u of usageThisMonth) {
      const key = u.agentId || "unassigned";
      const entry = costByAgent.get(key) || { providerCost: 0, customerCharge: 0, calls: 0 };
      entry.providerCost += u.providerCost;
      entry.customerCharge += u.customerCharge;
      entry.calls += 1;
      costByAgent.set(key, entry);
    }
    const agentProfitability = Array.from(costByAgent.entries()).map(([agentId, v]) => ({
      agentId,
      agentName: agentNameById.get(agentId) || "Unassigned",
      ...v,
      margin: v.customerCharge - v.providerCost,
    }));

    // Model Cost Engine visibility — cost by provider/model.
    const costByModel = new Map<string, { providerCost: number; customerCharge: number; calls: number }>();
    for (const u of usageThisMonth) {
      const key = `${u.provider}/${u.model}`;
      const entry = costByModel.get(key) || { providerCost: 0, customerCharge: 0, calls: 0 };
      entry.providerCost += u.providerCost;
      entry.customerCharge += u.customerCharge;
      entry.calls += 1;
      costByModel.set(key, entry);
    }
    const modelCosts = Array.from(costByModel.entries()).map(([model, v]) => ({ model, ...v }));

    // Agent Health (#16) — real success/failure rates from AgentTask status.
    const healthByAgent = new Map<string, { done: number; failed: number; other: number }>();
    for (const row of tasksByAgent) {
      const entry = healthByAgent.get(row.agentId) || { done: 0, failed: 0, other: 0 };
      if (row.status === "done") entry.done += row._count;
      else if (row.status === "failed") entry.failed += row._count;
      else entry.other += row._count;
      healthByAgent.set(row.agentId, entry);
    }
    const agentHealth = agents.map((a) => {
      const h = healthByAgent.get(a.id) || { done: 0, failed: 0, other: 0 };
      const total = h.done + h.failed + h.other;
      return { agentKey: a.key, agentName: a.name, ...h, total, successRate: total > 0 ? (h.done / total) * 100 : null };
    });

    await recordAdminAudit(admin.id, "view_finance", "system");

    return NextResponse.json({
      wallets: { totalBalance: wallets._sum.balance || 0, count: wallets._count },
      thisMonth: { providerCost: providerCostThisMonth, customerCharge: customerChargeThisMonth, margin: marginThisMonth, marginPct },
      allTime: { providerCost: usageAllTime._sum.providerCost || 0, customerCharge: usageAllTime._sum.customerCharge || 0, calls: usageAllTime._count },
      agentProfitability,
      modelCosts,
      agentHealth,
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to load finance data." }, { status: 500 });
  }
}
