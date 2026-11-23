/**
 * Integration provider registry — implements Complete Architecture #28
 * ("API Integration Layer": one centralized place for auth, not every
 * agent talking to every platform directly) and #29/#30 (OAuth + encrypted
 * credential storage).
 *
 * IMPORTANT: API versions and scope names on third-party platforms change.
 * The endpoints below are correct as of this writing, but — per the
 * Complete Architecture doc's own caution on TikTok — exact current
 * requirements must be re-checked against each platform's official
 * documentation before going live, especially for Meta (Facebook/
 * Instagram/WhatsApp), which reviews apps before granting most scopes
 * beyond a small testing allowlist.
 */

export type TokenResult = {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
};

export type AccountInfo = {
  externalAccountId: string;
  externalAccountName: string;
};

export type OAuthProvider = {
  key: string;
  label: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  scopes: string[];
  scopeSeparator: string;
  authorizeUrl: (params: { clientId: string; redirectUri: string; state: string; scopes: string[] }) => string;
  exchangeCode: (params: { clientId: string; clientSecret: string; redirectUri: string; code: string }) => Promise<TokenResult>;
  fetchAccountInfo?: (accessToken: string) => Promise<AccountInfo>;
};

function env(name: string): string | undefined {
  return process.env[name];
}

export function isOAuthConfigured(provider: OAuthProvider): boolean {
  return Boolean(env(provider.clientIdEnv) && env(provider.clientSecretEnv));
}

async function postForm(url: string, body: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error_description || data?.error?.message || `Token exchange failed (${res.status}).`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Meta (Facebook + Instagram + WhatsApp Business) — one Meta app, different
// scopes per surface. See Complete Architecture #11, #19-20.
// ---------------------------------------------------------------------------

const META_GRAPH_VERSION = "v21.0";

function metaAuthorizeUrl({ clientId, redirectUri, state, scopes }: { clientId: string; redirectUri: string; state: string; scopes: string[] }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: scopes.join(","),
  });
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${q.toString()}`;
}

async function metaExchangeCode({ clientId, clientSecret, redirectUri, code }: { clientId: string; clientSecret: string; redirectUri: string; code: string }): Promise<TokenResult> {
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  }).toString()}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Meta token exchange failed (${res.status}).`);
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

async function metaFetchAccountInfo(accessToken: string): Promise<AccountInfo> {
  const res = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Unable to read Meta account info.");
  return { externalAccountId: data.id, externalAccountName: data.name };
}

const facebook: OAuthProvider = {
  key: "facebook",
  label: "Facebook",
  clientIdEnv: "META_APP_ID",
  clientSecretEnv: "META_APP_SECRET",
  scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "pages_messaging"],
  scopeSeparator: ",",
  authorizeUrl: metaAuthorizeUrl,
  exchangeCode: metaExchangeCode,
  fetchAccountInfo: metaFetchAccountInfo,
};

const instagram: OAuthProvider = {
  key: "instagram",
  label: "Instagram",
  clientIdEnv: "META_APP_ID",
  clientSecretEnv: "META_APP_SECRET",
  scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
  scopeSeparator: ",",
  authorizeUrl: metaAuthorizeUrl,
  exchangeCode: metaExchangeCode,
  fetchAccountInfo: metaFetchAccountInfo,
};

const whatsapp: OAuthProvider = {
  key: "whatsapp",
  label: "WhatsApp",
  clientIdEnv: "META_APP_ID",
  clientSecretEnv: "META_APP_SECRET",
  scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
  scopeSeparator: ",",
  authorizeUrl: metaAuthorizeUrl,
  exchangeCode: metaExchangeCode,
  // WhatsApp doesn't have a "me" profile the same way — the phone number /
  // WABA ID is picked from the account's WhatsApp Business Accounts after
  // connecting (Meta's embedded signup flow). Left for the follow-up step.
};

// ---------------------------------------------------------------------------
// TikTok — Complete Architecture #10. Direct Post API for publishing.
// ---------------------------------------------------------------------------

const tiktok: OAuthProvider = {
  key: "tiktok",
  label: "TikTok",
  clientIdEnv: "TIKTOK_CLIENT_KEY",
  clientSecretEnv: "TIKTOK_CLIENT_SECRET",
  scopes: ["user.info.basic", "video.publish", "video.upload"],
  scopeSeparator: ",",
  authorizeUrl: ({ clientId, redirectUri, state, scopes }) => {
    const q = new URLSearchParams({
      client_key: clientId,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: scopes.join(","),
    });
    return `https://www.tiktok.com/v2/auth/authorize?${q.toString()}`;
  },
  exchangeCode: async ({ clientId, clientSecret, redirectUri, code }) => {
    const data = await postForm("https://open.tiktokapis.com/v2/oauth/token/", {
      client_key: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresInSeconds: data.expires_in };
  },
  fetchAccountInfo: async (accessToken) => {
    const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || "Unable to read TikTok account info.");
    return { externalAccountId: data?.data?.user?.open_id, externalAccountName: data?.data?.user?.display_name };
  },
};

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

const linkedin: OAuthProvider = {
  key: "linkedin",
  label: "LinkedIn",
  clientIdEnv: "LINKEDIN_CLIENT_ID",
  clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
  scopes: ["openid", "profile", "w_member_social"],
  scopeSeparator: " ",
  authorizeUrl: ({ clientId, redirectUri, state, scopes }) => {
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: scopes.join(" "),
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${q.toString()}`;
  },
  exchangeCode: async ({ clientId, clientSecret, redirectUri, code }) => {
    const data = await postForm("https://www.linkedin.com/oauth/v2/accessToken", {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });
    return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
  },
  fetchAccountInfo: async (accessToken) => {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Unable to read LinkedIn account info.");
    return { externalAccountId: data.sub, externalAccountName: data.name };
  },
};

// ---------------------------------------------------------------------------
// Google / YouTube
// ---------------------------------------------------------------------------

function googleProvider(key: string, label: string, extraScopes: string[]): OAuthProvider {
  return {
    key,
    label,
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    scopes: ["openid", "email", "profile", ...extraScopes],
    scopeSeparator: " ",
    authorizeUrl: ({ clientId, redirectUri, state, scopes }) => {
      const q = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        scope: scopes.join(" "),
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
    },
    exchangeCode: async ({ clientId, clientSecret, redirectUri, code }) => {
      const data = await postForm("https://oauth2.googleapis.com/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });
      return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresInSeconds: data.expires_in };
    },
    fetchAccountInfo: async (accessToken) => {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || "Unable to read Google account info.");
      return { externalAccountId: data.sub, externalAccountName: data.name || data.email };
    },
  };
}

const google = googleProvider("google", "Google", ["https://www.googleapis.com/auth/calendar.readonly"]);
const youtube = googleProvider("youtube", "YouTube", ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"]);

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  facebook, instagram, whatsapp, tiktok, linkedin, google, youtube,
};

/**
 * Platforms from User Flow Stage 11 that don't have one standard OAuth
 * flow Kwacha can drive end-to-end today (CRM/e-commerce vary by which
 * specific tool the business uses; email/calendar overlap with Google
 * above; payment gateway is intentionally simulated per current scope;
 * "Website" is a URL + optional API key, not OAuth). These render in the
 * UI as real entries with an honest "not connected yet" state rather than
 * being hidden, so the list still matches the product spec.
 */
export const MANUAL_PROVIDERS: { key: string; label: string; note: string }[] = [
  { key: "website", label: "Website", note: "Connect by entering your website URL in Business Profile — no OAuth needed." },
  { key: "crm", label: "CRM", note: "Coming soon — will depend on which CRM you use (HubSpot, Salesforce, etc.)." },
  { key: "email", label: "Email", note: "Coming soon." },
  { key: "calendar", label: "Calendar", note: "Use Google above for Calendar access." },
  { key: "ecommerce", label: "E-commerce", note: "Coming soon — will depend on your store platform (Shopify, WooCommerce, etc.)." },
  { key: "payment", label: "Payment system", note: "Simulated in this build — no real payment gateway is connected." },
];

export const ALL_PROVIDER_KEYS = [...Object.keys(OAUTH_PROVIDERS), ...MANUAL_PROVIDERS.map((p) => p.key)];
