import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
export async function GET(req:NextRequest){try{await requireAdmin(req);const agents=await prisma.agent.findMany({orderBy:{key:"asc"},include:{_count:{select:{tasks:true,runs:true}}}});const recent=await prisma.agentRun.findMany({orderBy:{createdAt:"desc"},take:40,include:{agent:true,mission:{select:{id:true,objective:true,status:true}}}});return NextResponse.json({agents,recent});}catch (e: any){if(e instanceof AuthError)return NextResponse.json({error:e.message},{status:e.status});return NextResponse.json({error:"Unable to load agent monitor."},{status:500});}}
