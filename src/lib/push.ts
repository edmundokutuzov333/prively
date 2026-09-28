import { requireSupabase } from '@/lib/supabase';

export function getVapidPublicKey(): string {
  return typeof import.meta.env.VITE_VAPID_PUBLIC_KEY === 'string'
    ? import.meta.env.VITE_VAPID_PUBLIC_KEY.trim()
    : '';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(normalized);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

export async function registerPushForCurrentUser(): Promise<void> {
  const publicKey = getVapidPublicKey();
  if (!publicKey) throw new Error('push_not_configured');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('push_not_supported');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('push_permission_denied');

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('push_subscription_invalid');
  }

  const { error } = await requireSupabase().rpc('register_push_subscription', {
    _endpoint: json.endpoint,
    _p256dh: json.keys.p256dh,
    _auth: json.keys.auth,
    _device_label: navigator.userAgent.slice(0, 120),
  });
  if (error) throw new Error(error.code ?? error.message);
}

export async function removeCurrentPushSubscription(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const { data } = await requireSupabase()
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle();

  if (data?.id) {
    await requireSupabase().rpc('remove_push_subscription', { _id: data.id });
  }

  await subscription.unsubscribe();
}
