import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { TOOL_SCHEMAS } from "@/lib/tools/schema";
import { resolvePermissionMode } from "@/lib/permissions/settings";

async function getWorkspaceId(req: NextRequest) {
  const user = await requireUser(req);
  const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!member) throw new Error("No workspace found for this account.");
  return member.workspaceId;
}

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId(req);
    const toolKeys = Object.keys(TOOL_SCHEMAS);
    const overrides = await prisma.permissionSetting.findMany({ where: { workspaceId } });
    const overrideMap = new Map(overrides.map((o) => [o.toolKey, o.mode]));
    const tools = await Promise.all(
      toolKeys.map(async (key) => {
        const { mode } = await resolvePermissionMode(workspaceId, key);
        return { toolKey: key, description: TOOL_SCHEMAS[key].description, mode, isOverride: overrideMap.has(key) };
      })
    );
    return NextResponse.json({ tools });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message || "Unable to load permissions." }, { status: 500 });
  }
}

const schema = z.object({ toolKey: z.string(), mode: z.enum(["auto", "approval", "blocked"]).nullable() });

export async function PATCH(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId(req);
    const body = schema.parse(await req.json());
    if (body.mode === null) {
      await prisma.permissionSetting.deleteMany({ where: { workspaceId, toolKey: body.toolKey } });
      return NextResponse.json({ ok: true, reset: true });
    }
    const setting = await prisma.permissionSetting.upsert({
      where: { workspaceId_toolKey: { workspaceId, toolKey: body.toolKey } },
      create: { workspaceId, toolKey: body.toolKey, mode: body.mode },
      update: { mode: body.mode },
    });
    return NextResponse.json({ setting });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid permission setting." }, { status: 400 });
    return NextResponse.json({ error: e.message || "Unable to update permission." }, { status: 500 });
  }
}
