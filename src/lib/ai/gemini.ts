import {
  chargeUsage,
  InsufficientBalanceError,
} from "@/lib/wallet/ledger";

import {
  getAgentDefinition,
  AgentKey,
} from "@/lib/agents/registry";

import {
  getKwachaToolsFor,
} from "@/lib/tools/schema";

import {
  executeTool,
  ToolResult,
} from "@/lib/tools/registry";

import {
  assertToolPermission,
} from "@/lib/permissions/engine";

import {
  resolvePermissionMode,
} from "@/lib/permissions/settings";

import { prisma } from "@/lib/database/prisma";

import {
  aiCompleteJson,
  aiCompleteWithTools,
  type AIChatMessage,
} from "@/lib/ai/provider-manager";

import type { KwachaToolDefinition } from "@/lib/tools/types";

export class GeminiConfigurationError extends Error {}

export class GeminiRequestError extends Error {}

export class WaitingForApprovalError extends Error {
  approvalId: string;

  constructor(approvalId: string) {
    super("Agent is waiting for human approval.");
    this.name = "WaitingForApprovalError";
    this.approvalId = approvalId;
  }
}

export { InsufficientBalanceError };

export type BillingContext = {
  workspaceId: string;
  agentId?: string | null;
  operation: string;
};

export type MissionPlan = {
  missionSummary: string;
  strategy: string;
  assumptions: string[];

  tasks: Array<{
    agentKey:
      | "research"
      | "marketing"
      | "sales"
      | "analytics"
      | "crm"
      | "communication"
      | "social"
      | "content";

    title: string;
    instructions: string;
    toolKeys: string[];
  }>;
};

export type AgentExecution = {
  outcome: string;
  findings: string[];
  nextActions: string[];
  metricsToWatch: string[];
  toolsUsed: string[];
  toolResults: ToolResult[];
};

const MAX_TOOL_CALLS_PER_TASK = 8;

export function checkpointKey(taskId: string) {
  return `agent.checkpoint.${taskId}`;
}

type AgentCheckpoint = {
  messages: AIChatMessage[];
  toolResults: ToolResult[];
  pendingApprovalId?: string;
};

function toolPayload(outcome: ToolResult) {
  return {
    success: outcome.ok,
    error: outcome.ok ? undefined : outcome.message,
    retryable: outcome.retryable ?? !outcome.ok,
    tool: outcome.tool,
    message: outcome.message,
    data: outcome.data,
  };
}

async function billCall(
  provider: string,
  model: string,
  usage: {
    promptTokens: number;
    completionTokens: number;
  },
  billing: BillingContext,
  operation: string
) {
  if (!usage.promptTokens && !usage.completionTokens) {
    return;
  }

  try {
    await chargeUsage({
      workspaceId: billing.workspaceId,
      agentId: billing.agentId,
      provider,
      model,
      operation,
      usage: {
        inputUnits: usage.promptTokens,
        outputUnits: usage.completionTokens,
      },
    });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      throw error;
    }

    /*
     * Do not allow a billing-recording problem to destroy
     * an otherwise successful AI operation.
     */
    console.error(
      "[KWACHA AI] Usage billing error:",
      error
    );
  }
}

/* =========================================================
   MISSION PLANNING
   ========================================================= */

export async function planMission(
  input: Record<string, unknown>,
  billing: BillingContext
): Promise<MissionPlan> {
  const systemInstruction = `
You are the KWACHA OS Orchestrator.

Create a concise, executable mission plan for specialized agents.

Return ONLY valid JSON with this structure:

{
  "missionSummary": "string",
  "strategy": "string",
  "assumptions": ["string"],
  "tasks": [
    {
      "agentKey": "research",
      "title": "string",
      "instructions": "string",
      "toolKeys": ["string"]
    }
  ]
}

Allowed agentKey values:
research, marketing, sales, analytics, crm, communication, social, content.

Rules:
- missionSummary must be useful.
- strategy must explain the execution approach.
- assumptions must be an array of strings.
- tasks must contain at least one executable task.
- Every task must have agentKey, title, instructions and toolKeys.
- toolKeys must always be an array.
- Never claim an external action already happened.
- Do not invent agent keys.
- Only assign social or communication when useful.
- Return JSON only.
`;

  try {
    const result =
      await aiCompleteJson<MissionPlan>(
        systemInstruction,
        JSON.stringify({
          task: "plan_mission",
          mission: input,

          availableAgentKeys: [
            "research",
            "marketing",
            "sales",
            "analytics",
            "crm",
            "communication",
            "social",
            "content",
          ],
        })
      );

    await billCall(
      result.provider,
      result.model,
      result.usage,
      billing,
      billing.operation
    );

    const raw = result.parsed;

    const validKeys = new Set([
      "research",
      "marketing",
      "sales",
      "analytics",
      "crm",
      "communication",
      "social",
      "content",
    ]);

    const missionSummary =
      typeof raw?.missionSummary === "string"
        ? raw.missionSummary.trim()
        : "";

    const strategy =
      typeof raw?.strategy === "string"
        ? raw.strategy.trim()
        : "";

    const assumptions =
      Array.isArray(raw?.assumptions)
        ? raw.assumptions.filter(
            (value): value is string =>
              typeof value === "string"
          )
        : [];

    const tasks: MissionPlan["tasks"] =
      Array.isArray(raw?.tasks)
        ? raw.tasks
            .filter((task) => {
              if (
                !task ||
                typeof task !== "object"
              ) {
                return false;
              }

              const key =
                (task as any).agentKey;

              return (
                typeof key === "string" &&
                validKeys.has(key)
              );
            })
            .map((task: any) => ({
              agentKey: task.agentKey,

              title:
                typeof task.title === "string" &&
                task.title.trim()
                  ? task.title.trim()
                  : `Execute ${task.agentKey} task`,

              instructions:
                typeof task.instructions === "string" &&
                task.instructions.trim()
                  ? task.instructions.trim()
                  : "Execute the assigned mission task using the available tools and report the results.",

              toolKeys:
                Array.isArray(task.toolKeys)
                  ? task.toolKeys.filter(
                      (
                        value: unknown
                      ): value is string =>
                        typeof value === "string" &&
                        Boolean(value.trim())
                    )
                  : [],
            }))
        : [];

    if (
      !missionSummary ||
      !strategy ||
      !tasks.length
    ) {
      throw new GeminiRequestError(
        `AI returned an incomplete mission plan from ${result.provider}/${result.model}.`
      );
    }

    return {
      missionSummary,
      strategy,
      assumptions,
      tasks,
    };
  } catch (error) {
    if (
      error instanceof GeminiRequestError ||
      error instanceof InsufficientBalanceError
    ) {
      throw error;
    }

    throw new GeminiRequestError(
      error instanceof Error
        ? error.message
        : "The AI provider could not create a mission plan."
    );
  }
}

/* =========================================================
   AGENT SYSTEM INSTRUCTIONS
   ========================================================= */

async function buildAgentSystemInstruction(
  agentKey: AgentKey,
  workspaceId: string
): Promise<string> {
  const def =
    getAgentDefinition(agentKey);

  const base = def
    ? `You are the ${def.name}, a specialized KWACHA OS agent. ${def.description} Your capabilities: ${def.capabilities.join(", ")}. You are strictly forbidden from: ${def.forbiddenActions.join("; ")}.`
    : "You are a specialized KWACHA OS agent.";

  const configRow =
    await prisma.agentSetting.findUnique({
      where: {
        workspaceId_agentKey: {
          workspaceId,
          agentKey,
        },
      },
    });

  const configText =
    configRow &&
    configRow.settingsJson !== "{}"
      ? ` This workspace has configured you specifically: ${configRow.settingsJson}. Follow these preferences.`
      : "";

  let brandText = "";

  if (
    agentKey === "content" ||
    agentKey === "communication" ||
    agentKey === "marketing"
  ) {
    const business =
      await prisma.business.findFirst({
        where: {
          workspaceId,
        },
        include: {
          brandProfile: true,
        },
      });

    const b =
      business?.brandProfile;

    if (b) {
      brandText =
        ` Brand guidance: tone=${b.tone || "professional"}; ` +
        `language=${b.language || "English"}; ` +
        `style=${b.style || "professional"}; ` +
        `words to use=${b.wordsToUse || ""}; ` +
        `words to avoid=${b.wordsToAvoid || ""}; ` +
        `emoji preference=${b.emojiPreference || "moderate"}; ` +
        `CTA style=${b.ctaStyle || "clear"}.`;
    }
  }

  return `
${base}
${configText}
${brandText}

Use the tools available to you to actually gather information
or take the simulated actions this task needs.

Do not merely describe what you would do.

Everything done through tools is simulated/demo data unless
a tool result explicitly confirms a real external action.

Never claim that a real-world action occurred without a
confirming tool result.

When you have enough information, stop calling tools and
provide a concise result.
`.trim();
}

/* =========================================================
   AGENT EXECUTION
   ========================================================= */

async function saveCheckpoint(
  missionId: string,
  taskId: string | undefined,
  checkpoint: AgentCheckpoint
) {
  if (!taskId) {
    return;
  }

  await prisma.memory.create({
    data: {
      missionId,
      key: checkpointKey(taskId),
      value: JSON.stringify(checkpoint),
    },
  });
}

async function loadCheckpoint(
  memories: Array<{ key: string; value: string }>,
  taskId?: string
): Promise<AgentCheckpoint | null> {
  if (!taskId) {
    return null;
  }

  const row = memories.find((item) => item.key === checkpointKey(taskId));
  if (!row) {
    return null;
  }

  try {
    return JSON.parse(row.value) as AgentCheckpoint;
  } catch {
    return null;
  }
}

export async function executeAgentTask(
  params: {
    missionId: string;
    taskId?: string;
    agentKey: AgentKey;
    agentName: string;
    taskTitle: string;
    instructions: string;
    mission: Record<string, unknown>;
    priorMemory: Array<{
      key: string;
      value: string;
    }>;
  },
  billing: BillingContext
): Promise<AgentExecution> {
  const def = getAgentDefinition(params.agentKey);

  const tools: KwachaToolDefinition[] = def
    ? getKwachaToolsFor(def.allowedTools)
    : [];

  const systemInstruction = await buildAgentSystemInstruction(
    params.agentKey,
    billing.workspaceId
  );

  const checkpoint = await loadCheckpoint(params.priorMemory, params.taskId);

  let toolResults: ToolResult[] = checkpoint?.toolResults || [];

  let messages: AIChatMessage[] = checkpoint?.messages || [
    {
      role: "user",
      content: JSON.stringify({
        task: params.taskTitle,
        instructions: params.instructions,
        mission: params.mission,
        priorMemory: params.priorMemory.filter(
          (item) => !item.key.startsWith("agent.checkpoint.")
        ),
      }),
    },
  ];

  try {
    let finalText = "";

    /*
     * -------------------------------------------------------
     * AGENT LOOP
     * -------------------------------------------------------
     *
     * Every AI call goes through provider-manager.
     *
     * Therefore the actual agent gets:
     *
     * Groq model 1
     * Groq model 2
     * Groq model 3
     * Groq model 4
     * OpenRouter
     * Mistral
     * Gemini
     *
     * depending on availability.
     */

    if (tools.length) {
      for (
        let round = 0;
        round < MAX_TOOL_CALLS_PER_TASK;
        round++
      ) {
        const result =
          await aiCompleteWithTools(
            systemInstruction,
            messages,
            tools,
            { agentKey: params.agentKey }
          );

        console.log(
          `[KWACHA AI] Agent ${params.agentKey} used ${result.provider}/${result.model}`
        );

        await billCall(
          result.provider,
          result.model,
          result.usage,
          billing,
          `${billing.operation}.tool_use`
        );

        /*
         * No tool call means the agent has finished.
         */
        if (
          !result.toolCalls.length
        ) {
          finalText =
            result.text.trim();

          break;
        }

        /*
         * Preserve the assistant's tool-call message.
         */
        messages = [
          ...messages,
          {
            role: "assistant",
            content:
              result.text || "",
            toolCalls:
              result.toolCalls,
          },
        ];

        /*
         * Execute requested tools.
         */
        for (
          const call of
            result.toolCalls
        ) {
          let outcome: ToolResult;

          try {
            await assertToolPermission(
              params.missionId,
              params.agentKey,
              call.name
            );

            const {
              mode,
              reason,
            } =
              await resolvePermissionMode(
                billing.workspaceId,
                call.name,
                call.arguments
              );

            if (
              mode === "blocked"
            ) {
              outcome = {
                tool: call.name,
                ok: false,

                message:
                  reason ||
                  "This action is blocked by your Permission Center settings.",
              };
            }

            else if (mode === "approval") {
              const approval = await prisma.approval.create({
                data: {
                  missionId: params.missionId,
                  title: `${params.agentName} wants to run ${call.name}`,
                  description:
                    reason ||
                    "This action requires human approval before it runs.",
                  agentKey: params.agentKey,
                  toolKey: call.name,
                  argsJson: JSON.stringify(call.arguments || {}),
                },
              });

              await saveCheckpoint(params.missionId, params.taskId, {
                messages: [
                  ...messages,
                  {
                    role: "tool",
                    toolCallId: call.id,
                    name: call.name,
                    content: JSON.stringify({
                      success: false,
                      error: "Waiting for human approval.",
                      retryable: false,
                      pendingApprovalId: approval.id,
                    }),
                  },
                ],
                toolResults,
                pendingApprovalId: approval.id,
              });

              throw new WaitingForApprovalError(approval.id);
            }

            else {
              outcome =
                await executeTool(
                  params.agentKey,
                  call.name,
                  {
                    missionId:
                      params.missionId,

                    args:
                      call.arguments,
                  }
                );
            }
          } catch (toolError) {
            outcome = {
              tool: call.name,
              ok: false,

              message:
                toolError instanceof
                Error
                  ? toolError.message
                  : "Tool execution failed.",
            };
          }

          toolResults.push(
            outcome
          );

          /*
           * Feed the actual tool result back
           * to the next AI call.
           */
          messages = [
            ...messages,
            {
              role: "tool",

              toolCallId:
                call.id,

              name:
                call.name,

              content:
                JSON.stringify(
                  toolPayload(outcome)
                ),
            },
          ];

          /*
           * Stop executing additional tool
           * calls once the task limit is reached.
           */
          if (
            toolResults.length >=
            MAX_TOOL_CALLS_PER_TASK
          ) {
            break;
          }
        }

        if (
          toolResults.length >=
          MAX_TOOL_CALLS_PER_TASK
        ) {
          break;
        }
      }
    }

    /*
     * Agents without tools need a normal AI response.
     *
     * This also handles the situation where the
     * agent's tool list is empty.
     */
    if (!tools.length) {
      const result =
        await aiCompleteWithTools(
          systemInstruction,
          messages,
          [],
          { agentKey: params.agentKey }
        );

      console.log(
        `[KWACHA AI] Agent ${params.agentKey} used ${result.provider}/${result.model}`
      );

      await billCall(
        result.provider,
        result.model,
        result.usage,
        billing,
        `${billing.operation}.response`
      );

      finalText =
        result.text.trim();
    }

    /*
     * If the model already produced a useful answer
     * and no tools were executed, return it directly.
     */
    if (
      toolResults.length === 0 &&
      finalText
    ) {
      return {
        outcome: finalText,

        findings: [],

        nextActions: [],

        metricsToWatch: [],

        toolsUsed: [],

        toolResults: [],
      };
    }

    /*
     * -------------------------------------------------------
     * FINAL SYNTHESIS
     * -------------------------------------------------------
     *
     * This is ALSO routed through provider-manager.
     *
     * Therefore synthesis gets the same fallback system.
     */

    const synthesis =
      await aiCompleteJson<{
        outcome: string;
        findings?: unknown[];
        nextActions?: unknown[];
        metricsToWatch?: unknown[];
      }>(
        `
${systemInstruction}

You have finished taking action for this task.

Summarize the actual result.

Return ONLY valid JSON:

{
  "outcome": "string",
  "findings": ["string"],
  "nextActions": ["string"],
  "metricsToWatch": ["string"]
}

IMPORTANT:
- Base the answer ONLY on the tool results supplied.
- Never invent results.
- Never claim a real external action happened unless a tool result confirms it.
- If a tool failed, acknowledge that in the outcome when relevant.
`.trim(),

        JSON.stringify({
          task:
            params.taskTitle,

          instructions:
            params.instructions,

          toolResults,
        })
      );

    console.log(
      `[KWACHA AI] Synthesis used ${synthesis.provider}/${synthesis.model}`
    );

    await billCall(
      synthesis.provider,
      synthesis.model,
      synthesis.usage,
      billing,
      `${billing.operation}.synthesis`
    );

    const raw =
      synthesis.parsed;

    if (
      !raw ||
      typeof raw.outcome !==
        "string" ||
      !raw.outcome.trim()
    ) {
      throw new GeminiRequestError(
        `AI returned an invalid agent result from ${synthesis.provider}/${synthesis.model}.`
      );
    }

    return {
      outcome:
        raw.outcome.trim(),

      findings:
        Array.isArray(
          raw.findings
        )
          ? raw.findings.filter(
              (
                value
              ): value is string =>
                typeof value ===
                "string"
            )
          : [],

      nextActions:
        Array.isArray(
          raw.nextActions
        )
          ? raw.nextActions.filter(
              (
                value
              ): value is string =>
                typeof value ===
                "string"
            )
          : [],

      metricsToWatch:
        Array.isArray(
          raw.metricsToWatch
        )
          ? raw.metricsToWatch.filter(
              (
                value
              ): value is string =>
                typeof value ===
                "string"
            )
          : [],

      toolsUsed:
        toolResults.map(
          (result) =>
            result.tool
        ),

      toolResults,
    };
  } catch (error) {
    if (
      error instanceof InsufficientBalanceError ||
      error instanceof WaitingForApprovalError ||
      error instanceof GeminiRequestError
    ) {
      throw error;
    }

    console.error(
      "[KWACHA AI] Agent execution failed:",
      error
    );

    throw new GeminiRequestError(
      error instanceof Error
        ? error.message
        : "The AI provider could not complete the agent task."
    );
  }
}

/* =========================================================
   STATUS
   ========================================================= */

export function aiProviderStatus() {
  return (
    "AI routing: Groq models → OpenRouter → Mistral → Gemini"
  );
}