import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { getMarketData, simulateMarketTick } from "@/lib/simulation/engine";
export async function GET(req:NextRequest){try{await requireUser(req);return NextResponse.json({simulation:true,instruments:await getMarketData()});}catch (e: any){if(e instanceof AuthError)return NextResponse.json({error:e.message},{status:e.status});return NextResponse.json({error:"Unable to load market simulation."},{status:500});}}
export async function POST(req:NextRequest){try{await requireUser(req);return NextResponse.json({simulation:true,instruments:await simulateMarketTick()});}catch (e: any){if(e instanceof AuthError)return NextResponse.json({error:e.message},{status:e.status});return NextResponse.json({error:"Unable to advance market simulation."},{status:500});}}
