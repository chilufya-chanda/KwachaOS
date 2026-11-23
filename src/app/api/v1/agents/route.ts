import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, recordApiUsage } from "@/lib/api/auth";
import { prisma } from "@/lib/database/prisma";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { apiError } from "@/lib/api/response";
export async function GET(req:NextRequest){let ctx:any;try{ctx=await requireApiKey(req,"read:agents");const agents=Object.values(AGENT_REGISTRY).map(a=>({key:a.key,name:a.name,description:a.description,capabilities:a.capabilities,forbiddenActions:a.forbiddenActions}));await recordApiUsage(ctx.key.id,"GET /api/v1/agents",200);return NextResponse.json({agents});}catch (e: any){return apiError(req,e,"GET /api/v1/agents",ctx?.key?.id);}}
