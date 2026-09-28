export const featureFlags = {
  designSystem: true,
  ageGate: true,
  auth: true,
  creatorStudio: false,
  wallet: false,
  payments: false,
  messaging: false,
  live: false,
  meetings: false,
  moderation: false,
  agency: false
} as const;

export type FeatureFlag = keyof typeof featureFlags;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag];
}