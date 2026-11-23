import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKey, recordApiUsage } from "@/lib/api/auth";
import { prisma } from "@/lib/database/prisma";
import { AGENT_REGISTRY, AgentKey } from "@/lib/agents/registry";
import { executeNextAgentTask } from "@/lib/orchestrator";
import { apiError } from "@/lib/api/response";
const schema=z.object({missionId:z.string().min(1),title:z.string().min(3).max(240).optional()});
export async function POST(req:NextRequest,{params}:{params:{agent:string}}){let ctx:any;try{ctx=await requireApiKey(req,"write:agents");const agent=AGENT_REGISTRY[params.agent as AgentKey];if(!agent)return NextResponse.json({error:"Unknown agent."},{status:404});const body=schema.parse(await req.json());const mission=await prisma.mission.findFirst({where:{id:body.missionId,business:{workspaceId:ctx.key.workspaceId}}});if(!mission)return NextResponse.json({error:"Mission not found for this API key workspace."},{status:404});const dbAgent=await prisma.agent.findUnique({where:{key:params.agent}});if(!dbAgent)return NextResponse.json({error:"Agent is not registered."},{status:404});await prisma.agentTask.create({data:{missionId:mission.id,agentId:dbAgent.id,title:body.title||`API requested ${agent.name} task`}});const result=await executeNextAgentTask(mission.id);await recordApiUsage(ctx.key.id,`POST /api/v1/agents/${params.agent}`,200);return NextResponse.json({status:"completed",agent:params.agent,result});}catch (e: any){return apiError(req,e,`POST /api/v1/agents/${params.agent}`,ctx?.key?.id);}}
