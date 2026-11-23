import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
export async function GET(req:NextRequest){try{await requireAdmin(req);const missions=await prisma.mission.findMany({orderBy:{updatedAt:"desc"},take:100,include:{business:{include:{workspace:true}},_count:{select:{agents:true,runs:true,leads:true,decisions:true,heartbeatRuns:true,simulationEvents:true}}}});return NextResponse.json({missions});}catch (e: any){if(e instanceof AuthError)return NextResponse.json({error:e.message},{status:e.status});return NextResponse.json({error:"Unable to load missions."},{status:500});}}
