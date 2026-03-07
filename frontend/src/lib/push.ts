// =============================================================================
// push.ts — Push notification subscription management
// =============================================================================
// Handles requesting notification permission, subscribing to Web Push,
// and sending the subscription to our backend.
//
// Flow:
//   1. Call subscribeToPush(accessToken)
//   2. We fetch the VAPID public key from the API
//   3. Ask the browser for notification permission
//   4. If granted, subscribe via the service worker's pushManager
//   5. Send the subscription object to our backend for storage
// =============================================================================

const API_URL = import.meta.env.VITE_API_URL || '';

// Convert a base64url string to a Uint8Array (required by pushManager.subscribe)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(accessToken: string): Promise<boolean> {
  try {
    // Check if push is supported
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return false;
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return false;
    }

    // Get the VAPID public key from our API
    const keyResponse = await fetch(`${API_URL}/push/vapid-key`);
    const { publicKey } = await keyResponse.json();
    if (!publicKey) {
      console.warn('No VAPID public key configured');
      return false;
    }

    // Wait for the service worker to be ready
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push (or get existing subscription)
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // Required: promise to show a notification for every push
      applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
    });

    // Send the subscription to our backend
    const response = await fetch(`${API_URL}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(subscription.toJSON()),
    });

    return response.ok;
  } catch (err) {
    console.error('Push subscription failed:', err);
    return false;
  }
}
