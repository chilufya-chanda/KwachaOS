import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/database/prisma";

export const API_SCOPES = [
  "read:agents", "write:agents", "read:missions", "write:missions",
  "read:activity", "read:economy", "read:markets", "write:paper-trades",
] as const;
export type ApiScope = typeof API_SCOPES[number];

export class ApiAuthError extends Error { status: number; constructor(message: string, status = 401) { super(message); this.status = status; } }

export function hashApiKey(secret: string) { return createHash("sha256").update(secret).digest("hex"); }
export function createApiSecret() {
  return `kw_live_${randomBytes(24).toString("hex")}`;
}

function extractKey(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return (req.headers.get("x-api-key") ?? "").trim();
}

export async function requireApiKey(req: NextRequest, requiredScope?: ApiScope) {
  const secret = extractKey(req);
  if (!secret) throw new ApiAuthError("Missing API key.");
  const key = await prisma.apiKey.findFirst({ where: { keyHash: hashApiKey(secret), revokedAt: null }, include: { workspace: true, user: true } });
  if (!key) throw new ApiAuthError("Invalid or revoked API key.");
  const scopes = JSON.parse(key.scopes || "[]") as string[];
  if (requiredScope && !scopes.includes(requiredScope)) throw new ApiAuthError(`API key lacks required scope: ${requiredScope}.`, 403);
  const since = new Date(Date.now() - 60_000);
  const recent = await prisma.apiUsage.count({ where: { apiKeyId: key.id, createdAt: { gte: since } } });
  if (recent >= 120) throw new ApiAuthError("API rate limit exceeded. Try again later.", 429);
  return { key, scopes };
}

export async function recordApiUsage(apiKeyId: string, endpoint: string, status: number) {
  await prisma.apiUsage.create({ data: { apiKeyId, endpoint, status } }).catch(() => undefined);
}
