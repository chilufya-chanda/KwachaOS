export interface MeResponse {
  workspace: { id: string; type: string } | null;
  subscription: { status: string; tier: string } | null;
  business: { id: string } | null;
}

export function nextStepPath(me: MeResponse): string {
  if (!me.workspace) return "/onboarding/workspace";
  if (!me.subscription || me.subscription.status !== "demo_active") {
    return "/onboarding/subscription";
  }
  if (!me.business) return "/onboarding/business";
  return "/workspace";
}
