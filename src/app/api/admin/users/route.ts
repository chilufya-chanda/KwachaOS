import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
export async function GET(req:NextRequest){try{await requireAdmin(req);const users=await prisma.user.findMany({orderBy:{createdAt:"desc"},take:100,select:{id:true,email:true,displayName:true,role:true,subscriptionTier:true,onboardingStatus:true,createdAt:true,_count:{select:{ownedWorkspaces:true,apiKeys:true,notifications:true}}}});return NextResponse.json({users});}catch (e: any){if(e instanceof AuthError)return NextResponse.json({error:e.message},{status:e.status});return NextResponse.json({error:"Unable to load users."},{status:500});}}
