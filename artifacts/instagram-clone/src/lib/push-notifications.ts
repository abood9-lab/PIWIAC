import { useCallback, useEffect, useState } from "react";
import { useGetVapidPublicKey, useSubscribeToPush, useUnsubscribeFromPush } from "@workspace/api-client-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  } catch {
    return null;
  }
}

/** Manages browser push permission + subscription state so notifications reach the user outside the site. */
export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    isPushSupported() ? Notification.permission : "denied"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const { data: vapidData } = useGetVapidPublicKey({ query: { enabled: isPushSupported(), retry: false } });
  const subscribeMutation = useSubscribeToPush();
  const unsubscribeMutation = useUnsubscribeFromPush();

  useEffect(() => {
    if (!isPushSupported()) return;
    registerServiceWorker().then(async (reg) => {
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    });
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isPushSupported() || !vapidData?.publicKey) return false;
    setIsBusy(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") return false;

      const reg = await registerServiceWorker();
      if (!reg) return false;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
        });
      }

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

      await subscribeMutation.mutateAsync({
        data: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
      });
      setIsSubscribed(true);
      return true;
    } finally {
      setIsBusy(false);
    }
  }, [vapidData, subscribeMutation]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isPushSupported()) return;
    setIsBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribeMutation.mutateAsync({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } finally {
      setIsBusy(false);
    }
  }, [unsubscribeMutation]);

  return { isSupported: isPushSupported(), permission, isSubscribed, isBusy, subscribe, unsubscribe };
}
