import { prisma } from "@/lib/database/prisma";

export async function recordSystemEvent(level: "info" | "warning" | "error", source: string, message: string) {
  try { await prisma.systemEvent.create({ data: { level, source, message } }); } catch { /* observability must never break the primary workflow */ }
}

export async function recordAdminAudit(adminId: string, action: string, target?: string) {
  try { await prisma.adminAuditLog.create({ data: { adminId, action, target } }); } catch { /* best effort */ }
}
