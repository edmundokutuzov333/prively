import { beforeEach, describe, expect, it } from 'vitest';
import { hasPin, setPin, verifyPin } from './pin';

describe('discreet PIN v2', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    });
  });

  it('stores a salted six digit PIN and verifies it', async () => {
    await setPin('123456');
    expect(hasPin()).toBe(true);
    expect(await verifyPin('123456')).toBe('ok');
    expect(await verifyPin('000000')).toBe('wrong');
  });

  it('locks progressively after the fifth wrong attempt', async () => {
    await setPin('123456');
    for (let attempt = 0; attempt < 5; attempt += 1) expect(await verifyPin('000000')).toBe('wrong');
    expect(await verifyPin('123456')).toBe('locked');
  });

  it('wipes the PIN on the tenth failure', async () => {
    await setPin('123456');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const record = JSON.parse(localStorage.getItem('prively.discreet.pin.v2') ?? '{}') as Record<string, unknown>;
      record.lockedUntil = 0;
      localStorage.setItem('prively.discreet.pin.v2', JSON.stringify(record));
      const result = await verifyPin('000000');
      if (attempt < 9) expect(['wrong', 'locked']).toContain(result);
      else expect(result).toBe('wiped');
    }
    expect(hasPin()).toBe(false);
  });

  it('migrates the legacy unsalted four digit PIN on successful unlock', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('1234'));
    localStorage.setItem('prively.discreet.pin', Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join(''));
    expect(await verifyPin('1234')).toBe('ok');
    expect(localStorage.getItem('prively.discreet.pin')).toBeNull();
    expect(localStorage.getItem('prively.discreet.pin.v2')).toBeTruthy();
  });
});
