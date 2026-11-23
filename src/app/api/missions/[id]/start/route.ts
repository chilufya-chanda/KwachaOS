import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { createMissionPlan, InsufficientBalanceError } from "@/lib/ai/mission-planner";
import {
  GeminiConfigurationError,
  GeminiRequestError,
} from "@/lib/ai/gemini";
import { heartbeatMission } from "@/lib/heartbeat/service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(req);

    const mission = await prisma.mission.findFirst({
      where: {
        id: params.id,
        business: {
          workspace: {
            members: {
              some: {
                userId: user.id,
              },
            },
          },
        },
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
      return NextResponse.json(
        { error: "Mission not found." },
        { status: 404 }
      );
    }

    if (!["draft", "paused"].includes(mission.status)) {
      return NextResponse.json(
        {
          error:
            "Mission cannot be started from its current state.",
        },
        { status: 400 }
      );
    }

    const defs = [
      ["research", "Research target market"],
      ["marketing", "Prepare acquisition campaign"],
      ["sales", "Define lead qualification flow"],
      ["analytics", "Define success measurement"],
    ] as const;

    for (const [key, name] of defs) {
      await prisma.agent.upsert({
        where: {
          key,
        },
        update: {},
        create: {
          key,
          name: `${name.split(" ")[0]} Agent`,
          description: `${name} for the mission.`,
        },
      });
    }

    /*
     * First create the AI mission plan.
     *
     * This creates the executable agent tasks and stores
     * the orchestrator plan in mission memory.
     */
    const plan = await createMissionPlan(mission.id);

    const first =
      mission.stages.find(
        (stage) => stage.status !== "complete"
      ) ?? mission.stages[0];

    if (!first) {
      return NextResponse.json(
        {
          error: "Mission has no stages configured.",
        },
        { status: 500 }
      );
    }

    /*
     * Activate the mission first.
     */
    await prisma.$transaction([
      prisma.mission.update({
        where: {
          id: mission.id,
        },
        data: {
          status: "active",
        },
      }),

      prisma.missionStage.update({
        where: {
          id: first.id,
        },
        data: {
          status: "active",
          startedAt: first.startedAt ?? new Date(),
        },
      }),

      prisma.activityLog.create({
        data: {
          missionId: mission.id,
          actor: "orchestrator",
          message: `Mission started. AI generated ${plan.tasks.length} executable agent tasks.`,
        },
      }),
    ]);

    /*
     * IMPORTANT:
     *
     * Start the first heartbeat immediately.
     *
     * The browser is already authenticated because this request
     * passed requireUser() above. The heartbeat itself operates
     * server-side, so it does not need another Firebase token.
     *
     * If the heartbeat fails, the mission remains active and the
     * original start request still returns the useful mission plan.
     */
    let heartbeat: unknown = null;

    try {
      heartbeat = await heartbeatMission(mission.id);
    } catch (heartbeatError) {
      console.error(
        "===================================="
      );
      console.error(
        "KWACHA MISSION FIRST HEARTBEAT ERROR"
      );
      console.error(heartbeatError);
      console.error(
        "===================================="
      );

      await prisma.activityLog.create({
        data: {
          missionId: mission.id,
          actor: "orchestrator",
          message:
            heartbeatError instanceof Error
              ? `First mission heartbeat failed: ${heartbeatError.message}`
              : "First mission heartbeat failed.",
        },
      });
    }

    return NextResponse.json({
      ok: true,

      model:
        process.env.GROQ_MODELS?.split(",")[0]?.trim() ||
        process.env.GEMINI_MODEL ||
        "configured-ai",

      plan,

      heartbeat,
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json(
        {
          error: e.message,
        },
        {
          status: e.status,
        }
      );
    }

    if (e instanceof InsufficientBalanceError) {
      return NextResponse.json(
        {
          error: e.message,
          code: "INSUFFICIENT_WALLET_BALANCE",
        },
        {
          status: 402,
        }
      );
    }

    if (e instanceof GeminiConfigurationError) {
      return NextResponse.json(
        {
          error: e.message,
          code: "GEMINI_NOT_CONFIGURED",
        },
        {
          status: 503,
        }
      );
    }

    if (e instanceof GeminiRequestError) {
      return NextResponse.json(
        {
          error: e.message,
          code: "AI_UNAVAILABLE",
        },
        {
          status: 502,
        }
      );
    }

    console.error(
      "KWACHA MISSION START ERROR:",
      e
    );

    return NextResponse.json(
      {
        error: "Unable to start mission.",
      },
      {
        status: 500,
      }
    );
  }
}