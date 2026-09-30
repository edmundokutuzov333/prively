export const AGE_GATE_KEY = 'prively.age_verified';
export const AGE_GATE_COOKIE = 'prively_age_verified=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure';

export function readAgeVerification(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(AGE_GATE_KEY) === '1'
    || document.cookie.split(';').some((item) => item.trim().startsWith('prively_age_verified=1'));
}

export function persistAgeVerification(): void {
  window.localStorage.setItem(AGE_GATE_KEY, '1');
  document.cookie = `${AGE_GATE_COOKIE}${window.location.protocol === 'https:' ? '' : ''}`;
}
