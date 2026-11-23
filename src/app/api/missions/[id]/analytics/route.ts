import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { getMissionAnalytics } from "@/lib/simulation/engine";
export async function GET(req:NextRequest,{params}:{params:{id:string}}){try{const user=await requireUser(req);const m=await prisma.mission.findFirst({where:{id:params.id,business:{workspace:{members:{some:{userId:user.id}}}}},select:{id:true}});if(!m)return NextResponse.json({error:"Mission not found."},{status:404});return NextResponse.json({analytics:await getMissionAnalytics(m.id)});}catch (e: any){if(e instanceof AuthError)return NextResponse.json({error:e.message},{status:e.status});return NextResponse.json({error:"Unable to load simulation analytics."},{status:500});}}
