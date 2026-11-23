import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKey,recordApiUsage } from "@/lib/api/auth";
import { simulatePaperTrade } from "@/lib/simulation/engine";
import { apiError } from "@/lib/api/response";
const schema=z.object({instrumentId:z.string().min(1),quantity:z.number().positive().max(1000000)});
export async function POST(req:NextRequest){let ctx:any;try{ctx=await requireApiKey(req,"write:paper-trades");const b=schema.parse(await req.json());const result=await simulatePaperTrade(b.instrumentId,b.quantity);await recordApiUsage(ctx.key.id,"POST /api/v1/paper-trades",201);return NextResponse.json({simulation:true,...result},{status:201});}catch (e: any){return apiError(req,e,"POST /api/v1/paper-trades",ctx?.key?.id);}}
