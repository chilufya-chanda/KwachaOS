import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { executeTool } from "@/lib/tools/registry";
import { AgentKey } from "@/lib/agents/registry";

async function owned(req: NextRequest, id: string) {
  const user = await requireUser(req);
  const mission = await prisma.mission.findFirst({ where: { id, business: { workspace: { members: { some: { userId: user.id } } } } }, select: { id: true } });
  return { user, mission };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { mission } = await owned(req, params.id);
    if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });
    const approvals = await prisma.approval.findMany({ where: { missionId: mission.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ approvals });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to load approvals." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, mission } = await owned(req, params.id);
    if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });
    const body = await req.json();
    if (!["approved", "rejected"].includes(body.status)) return NextResponse.json({ error: "Approval status must be approved or rejected." }, { status: 400 });

    const approval = await prisma.approval.findFirst({ where: { id: body.approvalId, missionId: mission.id } });
    if (!approval) return NextResponse.json({ error: "Approval not found." }, { status: 404 });
    if (approval.status !== "pending") return NextResponse.json({ error: "This approval was already decided." }, { status: 400 });

    let resultJson: string | null = null;
    if (body.status === "approved" && approval.toolKey && approval.agentKey) {
      // This is a real deferred tool call — actually perform it now, for real.
      try {
        const args = approval.argsJson ? JSON.parse(approval.argsJson) : {};
        const result = await executeTool(approval.agentKey as AgentKey, approval.toolKey, { missionId: mission.id, args });
        resultJson = JSON.stringify(result);
        await prisma.activityLog.create({ data: { missionId: mission.id, actor: approval.agentKey, message: `Approved action executed: ${result.message}` } });
        await prisma.memory.create({ data: { missionId: mission.id, key: `approval.${approval.id}.result`, value: JSON.stringify(result) } });
      } catch (execError: any) {
        resultJson = JSON.stringify({ tool: approval.toolKey, ok: false, message: execError.message || "Execution failed after approval." });
      }
    }

    const updated = await prisma.approval.update({ where: { id: approval.id }, data: { status: body.status, decidedById: user.id, decidedAt: new Date(), resultJson } });
    await prisma.activityLog.create({ data: { missionId: mission.id, actor: "system", message: `Human approval ${body.status}: ${approval.title}.` } });
    await prisma.decision.create({
      data: {
        missionId: mission.id,
        actor: "human",
        trigger: "approval",
        summary: `Approval ${body.status}: ${approval.title}`,
        action: body.status === "approved" ? "Allow requested action" : "Block requested action",
        outcome: body.status,
      },
    });
    return NextResponse.json({ approval: updated });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to update approval." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { mission } = await owned(req, params.id);
    if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });
    const body = await req.json();
    if (!body.title || !body.description) return NextResponse.json({ error: "Approval title and description are required." }, { status: 400 });
    const approval = await prisma.approval.create({ data: { missionId: mission.id, title: String(body.title).slice(0, 160), description: String(body.description).slice(0, 1000) } });
    await prisma.activityLog.create({ data: { missionId: mission.id, actor: "orchestrator", message: `Human approval requested: ${approval.title}.` } });
    await prisma.decision.create({
      data: { missionId: mission.id, actor: "orchestrator", trigger: "approval_required", summary: `Human approval requested: ${approval.title}`, action: "Wait for human decision", outcome: "pending" },
    });
    return NextResponse.json({ approval }, { status: 201 });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to create approval." }, { status: 500 });
  }
}
