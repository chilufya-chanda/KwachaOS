import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
const schema=z.object({name:z.string().trim().min(2).max(100)});
export async function GET(req:NextRequest){try{const user=await requireUser(req);return NextResponse.json({applications:await prisma.developerApplication.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"}})});}catch (e: any){if(e instanceof AuthError)return NextResponse.json({error:e.message},{status:e.status});return NextResponse.json({error:"Unable to load applications."},{status:500});}}
export async function POST(req:NextRequest){try{const user=await requireUser(req);const body=schema.parse(await req.json());const app=await prisma.developerApplication.create({data:{userId:user.id,name:body.name,status:"active"}});return NextResponse.json({application:app},{status:201});}catch (e: any){if(e instanceof AuthError)return NextResponse.json({error:e.message},{status:e.status});if(e instanceof z.ZodError)return NextResponse.json({error:"Application name is required."},{status:400});return NextResponse.json({error:"Unable to create application."},{status:500});}}
