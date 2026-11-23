import { prisma } from "@/lib/database/prisma";
import { executeNextAgentTask } from "@/lib/orchestrator";
import { InsufficientBalanceError } from "@/lib/wallet/ledger";
import {
  simulateCampaign,
  getMissionAnalytics,
} from "@/lib/simulation/engine";
import { recordDecision } from "@/lib/governance";

const INTERVAL_MS = Math.max(
  1000,
  Number(process.env.HEARTBEAT_INTERVAL_MS || 10000)
);

const TARGET_RE = /(\d[\d,]*)/;

function targetFromMission(successMetric: string) {
  const match = successMetric.match(TARGET_RE);

  return match
    ? Number(match[1].replace(/,/g, ""))
    : 0;
}

async function logRun(
  missionId: string,
  status: string,
  action: string,
  message: string,
  tasksProcessed = 0
) {
  return prisma.heartbeatRun.create({
    data: {
      missionId,
      status,
      action,
      message,
      tasksProcessed,
    },
  });
}

/**
 * A task is considered unfinished only while it is actually waiting
 * to execute or currently executing.
 *
 * Failed tasks must NOT block the mission forever.
 */
async function hasActiveTaskWork(missionId: string) {
  const count = await prisma.agentTask.count({
    where: {
      missionId,
      status: {
        in: ["queued", "running"],
      },
    },
  });

  return count > 0;
}

/**
 * Advance the mission stage when there is no queued/running work left.
 *
 * Failed tasks are treated as completed from the perspective of the
 * execution pipeline so one broken agent cannot permanently freeze
 * the entire mission.
 */
async function advanceStages(missionId: string) {
  const mission = await prisma.mission.findUnique({
    where: {
      id: missionId,
    },

    include: {
      stages: {
        orderBy: {
          order: "asc",
        },
      },
    },
  });

  if (!mission) {
    return;
  }

  const activeStage = mission.stages.find(
    (stage) => stage.status === "active"
  );

  if (!activeStage) {
    return;
  }

  const activeWork = await hasActiveTaskWork(
    missionId
  );

  if (activeWork) {
    return;
  }

  const nextStage = mission.stages.find(
    (stage) => stage.order === activeStage.order + 1
  );

  if (!nextStage) {
    return;
  }

  await prisma.$transaction([
    prisma.missionStage.update({
      where: {
        id: activeStage.id,
      },

      data: {
        status: "complete",
        completedAt: new Date(),
      },
    }),

    prisma.missionStage.update({
      where: {
        id: nextStage.id,
      },

      data: {
        status: "active",
        startedAt:
          nextStage.startedAt ?? new Date(),
      },
    }),

    prisma.mission.update({
      where: {
        id: missionId,
      },

      data: {
        currentStage: nextStage.name,
      },
    }),

    prisma.activityLog.create({
      data: {
        missionId,
        actor: "heartbeat",
        message: `Mission advanced from "${activeStage.name}" to "${nextStage.name}".`,
      },
    }),
  ]);
}

async function ensureAdaptiveTask(
  missionId: string,
  agentKey: string,
  title: string
) {
  const agent = await prisma.agent.findUnique({
    where: {
      key: agentKey,
    },
  });

  if (!agent) {
    return false;
  }

  const existing = await prisma.agentTask.findFirst({
    where: {
      missionId,
      agentId: agent.id,

      status: {
        in: ["queued", "running"],
      },
    },
  });

  if (existing) {
    return false;
  }

  await prisma.agentTask.create({
    data: {
      missionId,
      agentId: agent.id,
      title,
      status: "queued",
    },
  });

  await prisma.activityLog.create({
    data: {
      missionId,
      actor: "orchestrator",
      message: `Heartbeat created an adaptive ${agent.name} task based on current mission performance.`,
    },
  });

  return true;
}

export async function heartbeatMission(
  missionId: string
) {
  const mission = await prisma.mission.findUnique({
    where: {
      id: missionId,
    },

    include: {
      campaigns: true,
    },
  });

  if (!mission) {
    return {
      status: "failed",
      action: "lookup",
      message: "Mission not found.",
    };
  }

  if (mission.status !== "active") {
    return {
      status: "idle",
      action: "skip",
      message: `Mission is ${mission.status}.`,
    };
  }

  const now = new Date();

  /*
   * Deadline check
   */
  if (now >= mission.deadline) {
    await prisma.mission.update({
      where: {
        id: missionId,
      },

      data: {
        status: "expired",
        currentStage: "verification",
      },
    });

    await prisma.activityLog.create({
      data: {
        missionId,
        actor: "heartbeat",
        message:
          "Mission deadline reached; mission marked expired.",
      },
    });

    await logRun(
      missionId,
      "expired",
      "deadline_check",
      "Mission deadline reached."
    );

    return {
      status: "expired",
      action: "deadline_check",
      message: "Mission deadline reached.",
    };
  }

  /*
   * Current analytics
   */
  const analytics =
    await getMissionAnalytics(missionId);

  const target = targetFromMission(
    mission.successMetric
  );

  const spent = analytics.spend;

  /*
   * Budget check
   */
  if (
    spent >= mission.budgetAmount &&
    analytics.qualifiedLeads < target
  ) {
    await prisma.mission.update({
      where: {
        id: missionId,
      },

      data: {
        status: "failed",
        currentStage: "verification",
      },
    });

    await prisma.activityLog.create({
      data: {
        missionId,
        actor: "heartbeat",
        message:
          "Authorized simulation budget exhausted before the success target was reached.",
      },
    });

    await logRun(
      missionId,
      "failed",
      "budget_check",
      "Simulation budget exhausted before target."
    );

    return {
      status: "failed",
      action: "budget_check",
      message:
        "Simulation budget exhausted before target.",
    };
  }

  /*
   * Success check
   */
  if (
    target > 0 &&
    analytics.qualifiedLeads >= target
  ) {
    await prisma.mission.update({
      where: {
        id: missionId,
      },

      data: {
        status: "completed",
        currentStage: "completion",
      },
    });

    await prisma.activityLog.create({
      data: {
        missionId,
        actor: "heartbeat",
        message: `Success target reached: ${analytics.qualifiedLeads} qualified leads.`,
      },
    });

    const business =
      await prisma.business.findUnique({
        where: {
          id: mission.businessId,
        },

        select: {
          workspace: {
            select: {
              ownerId: true,
            },
          },
        },
      });

    if (business) {
      await prisma.notification.create({
        data: {
          userId:
            business.workspace.ownerId,

          title: "Mission completed",

          body: `The mission reached ${analytics.qualifiedLeads} qualified leads.`,
        },
      });
    }

    await logRun(
      missionId,
      "completed",
      "success_check",
      "Mission success target reached."
    );

    return {
      status: "completed",
      action: "success_check",
      message:
        "Mission success target reached.",
      qualifiedLeads:
        analytics.qualifiedLeads,
    };
  }

  /*
   * ---------------------------------------------------------
   * EXECUTE QUEUED AGENT TASK
   * ---------------------------------------------------------
   */

  let tasksProcessed = 0;

  const pending =
    await prisma.agentTask.count({
      where: {
        missionId,

        status: {
          in: ["queued", "running"],
        },
      },
    });

  if (pending > 0) {
    try {
      await executeNextAgentTask(
        missionId
      );

      tasksProcessed = 1;

      /*
       * IMPORTANT:
       *
       * executeNextAgentTask may complete or fail the task.
       * Either way, we immediately check whether another task
       * can continue the mission.
       */
      await advanceStages(
        missionId
      );

      const remaining =
        await prisma.agentTask.count({
          where: {
            missionId,

            status: {
              in: ["queued", "running"],
            },
          },
        });

      const result = {
        status: "active",
        action: "execute_task",
        message:
          remaining > 0
            ? "Heartbeat executed an agent task and more work remains."
            : "Heartbeat executed the final active agent task for this cycle.",
        tasksProcessed,
        remainingTasks: remaining,
      };

      await logRun(
        missionId,
        result.status,
        result.action,
        result.message,
        tasksProcessed
      );

      return result;
    } catch (e: any) {
      /*
       * Low wallet balance is different from an agent failure.
       * The mission must pause because AI execution cannot continue.
       */
      if (
        e instanceof InsufficientBalanceError
      ) {
        await prisma.mission.update({
          where: {
            id: missionId,
          },

          data: {
            status: "paused",
          },
        });

        await prisma.activityLog.create({
          data: {
            missionId,
            actor: "heartbeat",
            message: `Mission paused — wallet balance is too low to continue. ${e.message}`,
          },
        });

        const business =
          await prisma.business.findUnique({
            where: {
              id: mission.businessId,
            },

            select: {
              workspace: {
                select: {
                  ownerId: true,
                },
              },
            },
          });

        if (business) {
          await prisma.notification.create({
            data: {
              userId:
                business.workspace.ownerId,

              title:
                "Mission paused — low wallet balance",

              body: e.message,
            },
          });
        }

        await logRun(
          missionId,
          "paused",
          "low_balance",
          e.message
        );

        return {
          status: "paused",
          action: "low_balance",
          message: e.message,
        };
      }

      /*
       * Agent failure should NOT kill the whole mission.
       *
       * Record the failure, then continue the heartbeat.
       */
      const message =
        e instanceof Error
          ? e.message
          : "Agent execution failed.";

      await prisma.activityLog.create({
        data: {
          missionId,
          actor: "heartbeat",
          message: `Agent execution failed, but the mission will continue: ${message}`,
        },
      });

      await logRun(
        missionId,
        "active",
        "agent_failure_recovered",
        message
      );

      /*
       * Try to advance the mission despite the failed agent.
       */
      await advanceStages(
        missionId
      );

      /*
       * Check whether another task is available.
       */
      const remaining =
        await prisma.agentTask.count({
          where: {
            missionId,

            status: {
              in: ["queued", "running"],
            },
          },
        });

      if (remaining > 0) {
        return {
          status: "active",
          action:
            "agent_failure_recovered",
          message:
            `One agent task failed, but ${remaining} task(s) remain and the mission will continue.`,
          tasksProcessed,
          remainingTasks: remaining,
        };
      }

      /*
       * No active tasks remain.
       * Continue into the observation/adaptation phase.
       */
    }
  }

  /*
   * ---------------------------------------------------------
   * NO ACTIVE TASKS
   * OBSERVE PERFORMANCE AND ADAPT
   * ---------------------------------------------------------
   */

  const campaign =
    mission.campaigns.find(
      (c) => c.status === "active"
    ) ||
    mission.campaigns.find(
      (c) => c.status === "draft"
    );

  if (
    campaign &&
    spent < mission.budgetAmount
  ) {
    try {
      await simulateCampaign(
        missionId,
        {
          campaignId: campaign.id,
          seed: 42,
        }
      );
    } catch (e: any) {
      const message =
        e instanceof Error
          ? e.message
          : "Simulation failed.";

      await logRun(
        missionId,
        "active",
        "simulation_failure_recovered",
        message
      );

      await prisma.activityLog.create({
        data: {
          missionId,
          actor: "heartbeat",
          message:
            `Simulation cycle failed, but the mission remains active: ${message}`,
        },
      });
    }
  }

  const after =
    await getMissionAnalytics(
      missionId
    );

  /*
   * Check target again after simulation.
   */
  if (
    target > 0 &&
    after.qualifiedLeads >= target
  ) {
    await prisma.mission.update({
      where: {
        id: missionId,
      },

      data: {
        status: "completed",
        currentStage: "completion",
      },
    });

    await prisma.activityLog.create({
      data: {
        missionId,
        actor: "heartbeat",
        message: `Simulation observation reached the success target with ${after.qualifiedLeads} qualified leads.`,
      },
    });

    const business =
      await prisma.business.findUnique({
        where: {
          id: mission.businessId,
        },

        select: {
          workspace: {
            select: {
              ownerId: true,
            },
          },
        },
      });

    if (business) {
      await prisma.notification.create({
        data: {
          userId:
            business.workspace.ownerId,

          title: "Mission completed",

          body: `The mission reached ${after.qualifiedLeads} qualified leads.`,
        },
      });
    }

    await logRun(
      missionId,
      "completed",
      "success_check",
      "Simulation observation reached the success target."
    );

    return {
      status: "completed",
      action: "success_check",
      message:
        "Simulation observation reached the success target.",
      qualifiedLeads:
        after.qualifiedLeads,
    };
  }

  /*
   * Adaptive planning
   */
  const created =
    after.qualifiedLeads <
    after.enquiries * 0.35
      ? await ensureAdaptiveTask(
          missionId,
          "marketing",
          "Optimize campaign targeting from latest analytics"
        )
      : await ensureAdaptiveTask(
          missionId,
          "sales",
          "Qualify and follow up new simulated leads"
        );

  await recordDecision({
    missionId,
    actor: "heartbeat",
    trigger: "performance_observation",

    summary: created
      ? "Performance data requires another execution cycle."
      : "No additional execution was required after the latest observation.",

    evidence: {
      qualifiedLeads:
        after.qualifiedLeads,

      enquiries:
        after.enquiries,

      spend:
        after.spend,

      target,
    },

    action: created
      ? "Queue adaptive agent task"
      : "Remain idle",

    outcome: created
      ? "Adaptive task queued."
      : "Mission remains under observation.",
  });

  const action = created
    ? "adaptive_plan"
    : "idle";

  const message = created
    ? "Heartbeat observed new performance data and queued adaptive work."
    : "Heartbeat checked the mission and found no additional action required.";

  await logRun(
    missionId,
    "active",
    action,
    message
  );

  return {
    status: "active",
    action,
    message,
    analytics: after,
  };
}

export async function runHeartbeatOnce() {
  const missions =
    await prisma.mission.findMany({
      where: {
        status: "active",
      },

      select: {
        id: true,
      },
    });

  const results = [];

  for (const mission of missions) {
    results.push(
      await heartbeatMission(
        mission.id
      )
    );
  }

  return {
    intervalMs: INTERVAL_MS,
    missionsChecked:
      missions.length,
    results,
  };
}

export async function startHeartbeatWorker() {
  console.log(
    `[KWACHA HEARTBEAT] interval=${INTERVAL_MS}ms`
  );

  const tick = async () => {
    try {
      await runHeartbeatOnce();
    } catch (e: any) {
      console.error(
        "[KWACHA HEARTBEAT] cycle failed",
        e
      );
    }
  };

  await tick();

  return setInterval(
    tick,
    INTERVAL_MS
  );
}