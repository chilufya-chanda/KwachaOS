import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, recordApiUsage } from "@/lib/api/auth";
import { InsufficientBalanceError } from "@/lib/wallet/ledger";
export async function apiError(req:NextRequest,e:unknown,endpoint:string,keyId?:string){const status=e instanceof ApiAuthError?e.status:e instanceof InsufficientBalanceError?402:500;if(keyId)await recordApiUsage(keyId,endpoint,status);return NextResponse.json({error:e instanceof Error?e.message:"API request failed."},{status});}
