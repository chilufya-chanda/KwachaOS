import { AgentKey, getAgentDefinition } from "@/lib/agents/registry";
import { isToolAllowed } from "@/lib/tools/registry";
import { prisma } from "@/lib/database/prisma";

export async function assertToolPermission(missionId: string, agentKey: AgentKey, toolKey: string) {
  const definition = getAgentDefinition(agentKey);
  const allowed = Boolean(definition && isToolAllowed(agentKey, toolKey));
  if (!allowed) {
    await prisma.activityLog.create({ data: { missionId, actor: "policy-engine", message: `Rejected unauthorized tool call: ${agentKey} → ${toolKey}.` } });
    throw new Error(`Permission denied: ${agentKey} cannot use ${toolKey}.`);
  }
  return true;
}
