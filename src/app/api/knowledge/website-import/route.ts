import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

/**
 * User Flow Stage 12 — Website Import: "Fetch website → Extract relevant
 * pages → Clean content → Create business knowledge → Ask user to review."
 *
 * This is a real, single-page fetch and a basic tag-stripping extraction —
 * not a full multi-page crawl or a proper readability algorithm (no new
 * heavy dependency was added for that). Good enough to seed a knowledge
 * entry for human review, which is exactly the flow the spec describes:
 * nothing here is used by an agent until a human approves it below.
 */
function extractTextFromHtml(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 160) : "Imported page";
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|p|div|li|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title, text: body.slice(0, 6000) };
}

const schema = z.object({ url: z.string().url() });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });
    const business = await prisma.business.findFirst({ where: { workspaceId: member.workspaceId } });
    if (!business) return NextResponse.json({ error: "No business profile found for this workspace yet." }, { status: 404 });

    const { url } = schema.parse(await req.json());

    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": "KwachaOS-WebsiteImport/1.0" } });
    } catch {
      return NextResponse.json({ error: "Could not reach that website." }, { status: 400 });
    }
    if (!res.ok) return NextResponse.json({ error: `Website returned an error (${res.status}).` }, { status: 400 });
    const html = await res.text();
    const { title, text } = extractTextFromHtml(html);
    if (!text) return NextResponse.json({ error: "No readable text content was found on that page." }, { status: 400 });

    const item = await prisma.businessKnowledge.create({
      data: { businessId: business.id, workspaceId: member.workspaceId, source: "website", sourceRef: url, category: "other", title, content: text, status: "pending_review" },
    });

    return NextResponse.json({ item, note: "Imported as a single page, pending your review — not a full site crawl." }, { status: 201 });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Please provide a valid URL." }, { status: 400 });
    return NextResponse.json({ error: "Unable to import that website." }, { status: 500 });
  }
}
