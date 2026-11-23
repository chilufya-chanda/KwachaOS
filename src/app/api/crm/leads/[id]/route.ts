import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

async function ownedLead(req: NextRequest, id: string) {
  const user = await requireUser(req);
  const lead = await prisma.lead.findFirst({
    where: { id, mission: { business: { workspace: { members: { some: { userId: user.id } } } } } },
    include: { mission: { select: { id: true, objective: true, targetAudience: true } } },
  });
  return lead;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const lead = await ownedLead(req, params.id);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const [conversation, aiNotes] = await Promise.all([
      lead.contact
        ? prisma.communicationMessage.findMany({ where: { missionId: lead.missionId, contactRef: lead.contact }, orderBy: { createdAt: "asc" } })
        : Promise.resolve([]),
      prisma.activityLog.findMany({ where: { missionId: lead.missionId, actor: { in: ["sales", "crm"] } }, orderBy: { createdAt: "desc" }, take: 15 }),
    ]);

    return NextResponse.json({ lead, conversation, aiNotes, campaignSource: lead.mission });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to load lead." }, { status: 500 });
  }
}

const schema = z.object({
  status: z.enum(["new", "qualified", "contacted", "won", "lost"]).optional(),
  qualification: z.enum(["unqualified", "low", "medium", "high"]).optional(),
  interest: z.string().max(500).optional(),
  budget: z.number().nonnegative().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const lead = await ownedLead(req, params.id);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    const body = schema.parse(await req.json());
    const updated = await prisma.lead.update({ where: { id: lead.id }, data: body });
    await prisma.activityLog.create({ data: { missionId: lead.missionId, actor: "human", message: `Lead ${lead.name} updated manually by a human.` } });
    return NextResponse.json({ lead: updated });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid lead update." }, { status: 400 });
    return NextResponse.json({ error: "Unable to update lead." }, { status: 500 });
  }
}
