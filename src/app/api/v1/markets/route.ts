import { NextRequest,NextResponse } from "next/server";
import { requireApiKey,recordApiUsage } from "@/lib/api/auth";
import { getMarketData } from "@/lib/simulation/engine";
import { apiError } from "@/lib/api/response";
export async function GET(req:NextRequest){let ctx:any;try{ctx=await requireApiKey(req,"read:markets");const instruments=await getMarketData();await recordApiUsage(ctx.key.id,"GET /api/v1/markets",200);return NextResponse.json({simulation:true,instruments});}catch (e: any){return apiError(req,e,"GET /api/v1/markets",ctx?.key?.id);}}
