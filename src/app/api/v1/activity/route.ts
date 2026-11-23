import { NextRequest,NextResponse } from "next/server";
import { requireApiKey,recordApiUsage } from "@/lib/api/auth";
import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/api/response";
export async function GET(req:NextRequest){let ctx:any;try{ctx=await requireApiKey(req,"read:activity");const missionId=req.nextUrl.searchParams.get("missionId");const rows=await prisma.activityLog.findMany({where:{missionId:missionId||undefined,mission:{business:{workspaceId:ctx.key.workspaceId}}},orderBy:{createdAt:"desc"},take:100});await recordApiUsage(ctx.key.id,"GET /api/v1/activity",200);return NextResponse.json({activity:rows});}catch (e: any){return apiError(req,e,"GET /api/v1/activity",ctx?.key?.id);}}
