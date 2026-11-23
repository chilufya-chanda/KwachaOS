export type PlanTier = "lite" | "pro" | "max" | "enterprise";

export interface Plan {
  tier: PlanTier;
  name: string;
  tagline: string;
  demoPriceZmw: number | null; // null = "Contact us" (enterprise)
  features: string[];
}

// Prices are DEMO PRICING only — not connected to a real billing system.
// See Section 11/12 of the spec.
export const PLANS: Plan[] = [
  {
    tier: "lite",
    name: "KWACHA LITE",
    tagline: "For individuals exploring autonomous AI.",
    demoPriceZmw: 0,
    features: [
      "Limited missions",
      "Limited agent runs",
      "Basic memory",
      "Basic analytics",
      "Simulation environment",
    ],
  },
  {
    tier: "pro",
    name: "KWACHA PRO",
    tagline: "For serious individual users and small businesses.",
    demoPriceZmw: 499,
    features: [
      "More missions",
      "Higher agent limits",
      "Advanced memory",
      "Advanced analytics",
      "Business missions",
      "API access",
    ],
  },
  {
    tier: "max",
    name: "KWACHA MAX",
    tagline: "For advanced businesses and autonomous operations.",
    demoPriceZmw: 1499,
    features: [
      "Higher limits",
      "Advanced agents",
      "Priority execution",
      "Expanded API access",
      "Advanced automation",
      "More simultaneous missions",
      "Advanced economic controls",
    ],
  },
  {
    tier: "enterprise",
    name: "KWACHA ENTERPRISE",
    tagline: "For organizations.",
    demoPriceZmw: null,
    features: [
      "Custom limits",
      "Team management",
      "Advanced permissions",
      "Audit controls",
      "Custom integrations",
      "Dedicated infrastructure options",
    ],
  },
];

export function getPlan(tier: string): Plan | undefined {
  return PLANS.find((p) => p.tier === tier);
}
