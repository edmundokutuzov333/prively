const V2_KEY = 'prively.discreet.pin.v2';
const V1_KEY = 'prively.discreet.pin';
const ITERATIONS = 210_000;
const encoder = new TextEncoder();

type PinRecord = { salt: string; iterations: number; hash: string; fails: number; lockedUntil: number };
export type PinResult = 'ok' | 'wrong' | 'locked' | 'wiped';

function toBase64(bytes: Uint8Array): string {
  let value = '';
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt.buffer as ArrayBuffer, iterations }, key, 256);
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function readRecord(): PinRecord | null {
  try {
    const raw = localStorage.getItem(V2_KEY);
    return raw ? JSON.parse(raw) as PinRecord : null;
  } catch {
    return null;
  }
}

function writeRecord(record: PinRecord): void {
  localStorage.setItem(V2_KEY, JSON.stringify(record));
}

export function hasPin(): boolean {
  return Boolean(localStorage.getItem(V2_KEY) || localStorage.getItem(V1_KEY));
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin)) throw new Error('pin_invalid');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  writeRecord({ salt: toBase64(salt), iterations: ITERATIONS, hash: toBase64(hash), fails: 0, lockedUntil: 0 });
  localStorage.removeItem(V1_KEY);
}

async function migrateV1(pin: string): Promise<PinResult> {
  const legacy = localStorage.getItem(V1_KEY);
  if (!legacy || !/^\d{4}$/.test(pin)) return 'wiped';
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(pin));
  const supplied = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (supplied !== legacy) return 'wrong';
  await setPin(pin.padStart(6, '0'));
  return 'ok';
}

export async function verifyPin(pin: string): Promise<PinResult> {
  const record = readRecord();
  if (!record) return migrateV1(pin);
  if (!/^\d{6}$/.test(pin)) return 'wrong';
  if (Date.now() < record.lockedUntil) return 'locked';
  const candidate = await derive(pin, fromBase64(record.salt), record.iterations);
  if (constantTimeEqual(candidate, fromBase64(record.hash))) {
    writeRecord({ ...record, fails: 0, lockedUntil: 0 });
    return 'ok';
  }
  const fails = record.fails + 1;
  if (fails >= 10) {
    localStorage.removeItem(V2_KEY);
    return 'wiped';
  }
  writeRecord({ ...record, fails, lockedUntil: fails >= 5 ? Date.now() + 30_000 * 2 ** (fails - 5) : 0 });
  return 'wrong';
}
