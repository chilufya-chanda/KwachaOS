import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { ALL_PROVIDER_KEYS } from "@/lib/integrations/providers";

const schema = z.object({
  businessName: z.string().max(120).optional(),
  industry: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  country: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  website: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  products: z.string().max(2000).optional(),
  targetCustomers: z.string().max(500).optional(),
  language: z.string().max(60).optional(),
  hours: z.string().max(200).optional(),
  purposes: z.array(z.enum(["marketing", "organicSocial", "customerComms", "leadGen", "paidAds", "customerSupport", "brandOnly"])).default([]),
});

export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const user = await requireUser(req);
    if (!ALL_PROVIDER_KEYS.includes(params.provider)) {
      return NextResponse.json({ error: `"${params.provider}" is not a recognized platform.` }, { status: 404 });
    }
    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });

    const body = schema.parse(await req.json());
    const p = new Set(body.purposes);

    const integration = await prisma.integration.upsert({
      where: { workspaceId_provider: { workspaceId: member.workspaceId, provider: params.provider } },
      create: {
        workspaceId: member.workspaceId,
        provider: params.provider,
        contextBusinessName: body.businessName,
        contextIndustry: body.industry,
        contextCategory: body.category,
        contextCountry: body.country,
        contextRegion: body.region,
        contextCity: body.city,
        contextWebsite: body.website,
        contextPhone: body.phone,
        contextEmail: body.email,
        contextDescription: body.description,
        contextProducts: body.products,
        contextTargetCustomers: body.targetCustomers,
        contextLanguage: body.language,
        contextHours: body.hours,
        purposeMarketing: p.has("marketing"),
        purposeOrganicSocial: p.has("organicSocial"),
        purposeCustomerComms: p.has("customerComms"),
        purposeLeadGen: p.has("leadGen"),
        purposePaidAds: p.has("paidAds"),
        purposeCustomerSupport: p.has("customerSupport"),
        purposeBrandOnly: p.has("brandOnly"),
      },
      update: {
        contextBusinessName: body.businessName,
        contextIndustry: body.industry,
        contextCategory: body.category,
        contextCountry: body.country,
        contextRegion: body.region,
        contextCity: body.city,
        contextWebsite: body.website,
        contextPhone: body.phone,
        contextEmail: body.email,
        contextDescription: body.description,
        contextProducts: body.products,
        contextTargetCustomers: body.targetCustomers,
        contextLanguage: body.language,
        contextHours: body.hours,
        purposeMarketing: p.has("marketing"),
        purposeOrganicSocial: p.has("organicSocial"),
        purposeCustomerComms: p.has("customerComms"),
        purposeLeadGen: p.has("leadGen"),
        purposePaidAds: p.has("paidAds"),
        purposeCustomerSupport: p.has("customerSupport"),
        purposeBrandOnly: p.has("brandOnly"),
      },
    });

    await prisma.integrationAuditLog.create({
      data: { workspaceId: member.workspaceId, provider: params.provider, action: "context_saved" },
    });

    return NextResponse.json({ integration: { provider: integration.provider, contextBusinessName: integration.contextBusinessName } });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e?.issues) return NextResponse.json({ error: "Invalid business context." }, { status: 400 });
    return NextResponse.json({ error: "Unable to save business context." }, { status: 500 });
  }
}
