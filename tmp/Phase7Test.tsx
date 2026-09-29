import { useFeatureFlags } from '@/features/feature-flags/useFeatureFlags';
export function Phase7Test(){ const { flags } = useFeatureFlags(); return <div>{flags.messaging ? 'on' : 'off'}</div>; }