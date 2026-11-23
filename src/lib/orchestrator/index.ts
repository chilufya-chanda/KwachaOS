import { prisma } from "@/lib/database/prisma";
import { executeAgentTask, GeminiConfigurationError, GeminiRequestError, InsufficientBalanceError } from "@/lib/ai/gemini";
import { AgentKey } from "@/lib/agents/registry";

export async function executeNextAgentTask(missionId: string) {
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    include: {
      business: true,
      agents: { include: { agent: true }, where: { status: { not: "done" } }, orderBy: { createdAt: "asc" } },
      memories: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });
  if (!mission) throw new Error("Mission not found.");

  const task = mission.agents[0];
  if (!task) throw new Error("No queued agent task remains.");

  const agentKey = task.agent.key as AgentKey;
  const planMemory = mission.memories.find((m) => m.key === `plan.${agentKey}`);
  let instructions = `Complete the assigned ${task.agent.name} task using mission context.`;
  if (planMemory) {
    try {
      const p = JSON.parse(planMemory.value);
      instructions = p.instructions || instructions;
    } catch {
      // Malformed plan memory — fall back to the generic instruction above.
    }
  }

  await prisma.agent.update({ where: { id: task.agentId }, data: { status: "active" } });
  await prisma.agentTask.update({ where: { id: task.id }, data: { status: "running" } });

  try {
    // The agent itself now genuinely chooses which tools to call and with
    // what arguments (real Gemini function calling) — no more keyword
    // matching or post-hoc permission-check-and-hope.
    const ai = await executeAgentTask(
      {
        missionId,
        agentKey,
        agentName: task.agent.name,
        taskTitle: task.title,
        instructions,
        mission: {
          business: mission.business.name,
          industry: mission.business.industry,
          location: mission.business.location,
          objective: mission.objective,
          targetAudience: mission.targetAudience,
          budgetAmount: mission.budgetAmount,
          currency: mission.currency,
          deadline: mission.deadline.toISOString(),
          successMetric: mission.successMetric,
        },
        priorMemory: mission.memories.map((m) => ({ key: m.key, value: m.value })),
      },
      { workspaceId: mission.business.workspaceId, agentId: task.agentId, operation: `agent_task.${agentKey}` }
    );

    const output = JSON.stringify({ outcome: ai.outcome, findings: ai.findings, nextActions: ai.nextActions, metricsToWatch: ai.metricsToWatch, toolResults: ai.toolResults });

    await prisma.$transaction([
      prisma.agentTask.update({ where: { id: task.id }, data: { status: "done" } }),
      prisma.agent.update({ where: { id: task.agentId }, data: { status: "idle" } }),
      prisma.agentRun.create({ data: { missionId, agentId: task.agentId, input: JSON.stringify({ task: task.title, instructions }), output, reasoning: ai.outcome, toolsUsed: JSON.stringify(ai.toolsUsed) } }),
      prisma.memory.create({ data: { missionId, key: `run.${agentKey}.${Date.now()}`, value: output } }),
      prisma.activityLog.create({ data: { missionId, actor: agentKey, message: `${task.agent.name} completed task and executed ${ai.toolsUsed.length ? ai.toolsUsed.join(", ") : "no tools"}.` } }),
      prisma.decision.create({
        data: {
          missionId,
          actor: "orchestrator",
          trigger: "agent_result",
          summary: ai.outcome,
          evidence: JSON.stringify({ task: task.title, findings: ai.findings, toolResults: ai.toolResults }),
          action: `${agentKey}: ${task.title}`,
          outcome: "Recorded agent result for next decision cycle.",
        },
      }),
    ]);

    return { taskId: task.id, agentKey, ai, toolResults: ai.toolResults };
  } catch (error) {
    await prisma.$transaction([
      prisma.agentTask.update({ where: { id: task.id }, data: { status: "failed" } }),
      prisma.agent.update({ where: { id: task.agentId }, data: { status: "error" } }),
      prisma.activityLog.create({
        data: {
          missionId,
          actor: agentKey,
          message: error instanceof InsufficientBalanceError ? `${task.agent.name} paused — wallet balance too low.` : error instanceof Error ? error.message : "Agent execution failed.",
        },
      }),
    ]);
    if (error instanceof GeminiConfigurationError || error instanceof GeminiRequestError || error instanceof InsufficientBalanceError) throw error;
    throw error;
  }
}
