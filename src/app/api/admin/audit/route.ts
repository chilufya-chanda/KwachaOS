import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
export async function GET(req:NextRequest){try{await requireAdmin(req);const audit=await prisma.adminAuditLog.findMany({orderBy:{createdAt:"desc"},take:100,include:{admin:{select:{email:true,displayName:true}}}});return NextResponse.json({audit});}catch (e: any){if(e instanceof AuthError)return NextResponse.json({error:e.message},{status:e.status});return NextResponse.json({error:"Unable to load audit logs."},{status:500});}}
