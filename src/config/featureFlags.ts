export const featureFlags = {
  designSystem: true,
  ageGate: true,
  auth: true,
  phase2Experience: true,
  phase3Monetization: false,
  phase6Financials: true,
  creatorStudio: false,
  wallet: true,
  payments: true,
  messaging: false,
  live: false,
  meetings: false,
  moderation: false,
  agency: false
} as const;

export function isFeatureEnabled(name: keyof typeof featureFlags): boolean {
  return featureFlags[name];
}
