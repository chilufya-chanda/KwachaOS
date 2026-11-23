import { NextRequest,NextResponse } from "next/server";
import { requireApiKey,recordApiUsage } from "@/lib/api/auth";
import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/api/response";
export async function GET(req:NextRequest){let ctx:any;try{ctx=await requireApiKey(req,"read:economy");const missions=await prisma.mission.findMany({where:{business:{workspaceId:ctx.key.workspaceId}},include:{campaigns:true}});const authorized=missions.reduce((n,m)=>n+m.budgetAmount,0);const spent=missions.reduce((n,m)=>n+m.campaigns.reduce((x,c)=>x+c.spend,0),0);await recordApiUsage(ctx.key.id,"GET /api/v1/economy",200);return NextResponse.json({simulation:true,currency:"ZMW",authorized,spent,remaining:Math.max(0,authorized-spent)});}catch (e: any){return apiError(req,e,"GET /api/v1/economy",ctx?.key?.id);}}
