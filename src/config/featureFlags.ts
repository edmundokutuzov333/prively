export const featureFlags = {
  designSystem: true,
  ageGate: true,
  auth: true,
  phase2Experience: false,
  phase3Monetization: false,
  creatorStudio: false,
  wallet: false,
  payments: false,
  messaging: false,
  live: false,
  meetings: false,
  moderation: false,
  agency: false
} as const;

export function isFeatureEnabled(name: keyof typeof featureFlags): boolean {
  return featureFlags[name];
}
