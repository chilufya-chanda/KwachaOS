import crypto from "crypto";

/**
 * OAuth redirects are full-page browser navigations — they can't carry our
 * normal `Authorization: Bearer <firebase-token>` header. So instead, the
 * client asks the backend (over an authenticated fetch) to mint a signed
 * "state" token that encodes who initiated the flow. The provider echoes
 * that state back on the callback, and we verify + decode it there — this
 * is what tells the callback which workspace/user to attach the connection
 * to, without needing the browser to carry auth headers through a
 * third-party redirect.
 */

type StatePayload = {
  workspaceId: string;
  userId: string;
  provider: string;
  nonce: string;
  exp: number; // unix seconds
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Add it to .env.local before connecting an integration.");
  }
  return secret;
}

export function signOAuthState(workspaceId: string, userId: string, provider: string): string {
  const payload: StatePayload = {
    workspaceId,
    userId,
    provider,
    nonce: crypto.randomBytes(8).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes to complete the OAuth dance
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export class StateError extends Error {}

export function verifyOAuthState(token: string, expectedProvider: string): StatePayload {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) throw new StateError("Malformed OAuth state.");
  const expectedSig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new StateError("OAuth state signature is invalid — possible tampering.");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  if (payload.provider !== expectedProvider) throw new StateError("OAuth state does not match this provider.");
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new StateError("OAuth state has expired. Please try connecting again.");
  return payload;
}
