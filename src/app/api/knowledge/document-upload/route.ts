import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

/**
 * User Flow Stage 12 — Document Upload. Real text extraction for .txt and
 * .csv (native) and .docx (via mammoth). PDF is NOT extracted here — doing
 * that reliably needs a PDF-parsing dependency I haven't added and can't
 * verify works without running it, and a fake/broken extraction would be
 * worse than an honest "not supported yet." Ask the person to paste PDF
 * content manually via the knowledge base's manual-entry form instead.
 */

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
    if (!member) return NextResponse.json({ error: "No workspace found for this account." }, { status: 404 });
    const business = await prisma.business.findFirst({ where: { workspaceId: member.workspaceId } });
    if (!business) return NextResponse.json({ error: "No business profile found for this workspace yet." }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    const category = String(form.get("category") || "other");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file was provided." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File is too large (10MB max)." }, { status: 400 });

    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let content = "";

    if (name.endsWith(".txt") || name.endsWith(".csv")) {
      content = buffer.toString("utf-8");
    } else if (name.endsWith(".docx")) {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
      } catch {
        return NextResponse.json({ error: "Could not read that .docx file. Try pasting the content manually instead." }, { status: 400 });
      }
    } else if (name.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "PDF text extraction isn't supported yet in this build — please paste the content manually using the knowledge base's manual-entry option." },
        { status: 400 }
      );
    } else {
      return NextResponse.json({ error: "Supported formats: .txt, .csv, .docx (PDF not yet supported)." }, { status: 400 });
    }

    content = content.trim().slice(0, 8000);
    if (!content) return NextResponse.json({ error: "No readable text was found in that file." }, { status: 400 });

    const item = await prisma.businessKnowledge.create({
      data: { businessId: business.id, workspaceId: member.workspaceId, source: "document", sourceRef: file.name, category, title: file.name, content, status: "pending_review" },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unable to process that document." }, { status: 500 });
  }
}
