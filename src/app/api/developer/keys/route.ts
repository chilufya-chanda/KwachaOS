import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { API_SCOPES, createApiSecret, hashApiKey } from "@/lib/api/auth";

const createSchema = z.object({ label: z.string().trim().min(2).max(80), scopes: z.array(z.string()).min(1).max(20) });
async function workspaceFor(userId: string) { return prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } }); }

export async function GET(req: NextRequest) {
  try { const user = await requireUser(req); const membership = await workspaceFor(user.id); if (!membership) return NextResponse.json({ keys: [] });
    const keys = await prisma.apiKey.findMany({ where: { workspaceId: membership.workspaceId }, orderBy: { createdAt: "desc" }, select: { id:true,label:true,scopes:true,createdAt:true,revokedAt:true } });
    return NextResponse.json({ keys: keys.map(k => ({ ...k, scopes: JSON.parse(k.scopes || "[]") })) });
  } catch (e: any) { if (e instanceof AuthError) return NextResponse.json({error:e.message},{status:e.status}); return NextResponse.json({error:"Unable to load API keys."},{status:500}); }
}

export async function POST(req: NextRequest) {
  try { const user = await requireUser(req); const body=createSchema.parse(await req.json()); const invalid=body.scopes.some(s=>!(API_SCOPES as readonly string[]).includes(s)); if(invalid) return NextResponse.json({error:"One or more API scopes are invalid."},{status:400});
    const membership=await workspaceFor(user.id); if(!membership)return NextResponse.json({error:"Workspace not found."},{status:404});
    const secret=createApiSecret(); const key=await prisma.apiKey.create({data:{workspaceId:membership.workspaceId,userId:user.id,label:body.label,keyHash:hashApiKey(secret),scopes:JSON.stringify(body.scopes)}});
    await prisma.notification.create({data:{userId:user.id,title:"API key created",body:`${body.label} was created. The secret is shown only once.`}});
    return NextResponse.json({ key:{id:key.id,label:key.label,scopes:body.scopes,createdAt:key.createdAt}, secret, warning:"Copy this secret now. It will not be displayed again." },{status:201});
  } catch (e: any){ if(e instanceof AuthError)return NextResponse.json({error:e.message},{status:e.status}); if(e instanceof z.ZodError)return NextResponse.json({error:"Provide a label and at least one valid scope."},{status:400}); return NextResponse.json({error:"Unable to create API key."},{status:500}); }
}
