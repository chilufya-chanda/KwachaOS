import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
export async function GET(req:NextRequest){try{await requireAdmin(req);const events=await prisma.systemEvent.findMany({orderBy:{createdAt:"desc"},take:100});return NextResponse.json({events});}catch (e: any){if(e instanceof AuthError)return NextResponse.json({error:e.message},{status:e.status});return NextResponse.json({error:"Unable to load system events."},{status:500});}}
