import { useState, useEffect } from 'react';
import { subscribeToPush } from '../lib/push.ts';
import { apiFetch } from '../lib/api.ts';

const API_URL = import.meta.env.VITE_API_URL || '';

interface BackendInfo {
  version: string;
  buildTime: string;
  environment: string;
  startedAt: string;
}

interface SwVersion {
  swPushVersion: string;
  swPushBuildTime: string;
}

// Ask the active service worker for its version via MessageChannel
async function getSwVersion(): Promise<SwVersion | null> {
  const reg = await navigator.serviceWorker?.ready;
  if (!reg?.active) return null;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data);
    // Timeout after 2s in case the SW doesn't respond (old version without handler)
    setTimeout(() => resolve(null), 2000);
    reg.active!.postMessage({ type: 'GET_SW_VERSION' }, [channel.port2]);
  });
}

function TestNotificationButton() {
  function sendTest() {
    apiFetch('/admin/test-notification', { method: 'POST' })
      .then((res) => {
        if (!res.ok) alert('Failed to send — are you subscribed?');
      })
      .catch(() => alert('Failed to reach API'));
  }

  return (
    <button className="btn btn-outline btn-full" onClick={sendTest}>
      Send test notification
    </button>
  );
}

export default function Info() {
  const [backend, setBackend] = useState<BackendInfo | null>(null);
  const [error, setError] = useState('');
  const [swStatus, setSwStatus] = useState('checking...');
  const [swVersion, setSwVersion] = useState<SwVersion | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/info`)
      .then((res) => res.json())
      .then(setBackend)
      .catch(() => setError('Failed to reach API'));

    // Check service worker status and version
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(async (reg) => {
        if (!reg) {
          setSwStatus('not registered');
        } else if (reg.waiting) {
          setSwStatus('update waiting');
        } else if (reg.active) {
          setSwStatus('active');
        } else if (reg.installing) {
          setSwStatus('installing');
        }

        // Query the SW for its version
        const ver = await getSwVersion();
        setSwVersion(ver);
      });
    } else {
      setSwStatus('not supported');
    }
  }, []);

  function formatTime(iso: string): string {
    if (!iso || iso === 'dev' || iso === 'unknown') return iso || '—';
    return new Date(iso).toLocaleString();
  }

  return (
    <div className="info-page">
      <div className="page-header">
        <h2>System Info</h2>
      </div>

      <section className="section">
        <h3 className="section-title">Frontend</h3>
        <div className="info-grid">
          <div className="info-label">Version</div>
          <div className="info-value">{__BUILD_VERSION__}</div>
          <div className="info-label">Built</div>
          <div className="info-value">{formatTime(__BUILD_TIME__)}</div>
        </div>
      </section>

      <section className="section">
        <h3 className="section-title">Service Worker</h3>
        <div className="info-grid">
          <div className="info-label">Status</div>
          <div className="info-value">{swStatus}</div>
          <div className="info-label">sw-push.js Version</div>
          <div className="info-value">{swVersion?.swPushVersion || '—'}</div>
          <div className="info-label">sw-push.js Built</div>
          <div className="info-value">{formatTime(swVersion?.swPushBuildTime || '')}</div>
        </div>
      </section>

      <section className="section">
        <h3 className="section-title">Backend</h3>
        {error ? (
          <div className="form-error">{error}</div>
        ) : !backend ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="info-grid">
            <div className="info-label">Version</div>
            <div className="info-value">{backend.version}</div>
            <div className="info-label">Built</div>
            <div className="info-value">{formatTime(backend.buildTime)}</div>
            <div className="info-label">Environment</div>
            <div className="info-value">{backend.environment}</div>
            <div className="info-label">Lambda Started</div>
            <div className="info-value">{formatTime(backend.startedAt)}</div>
          </div>
        )}
      </section>

      <section className="section">
        <h3 className="section-title">Push Notifications</h3>
        <div className="info-grid">
          <div className="info-label">Permission</div>
          <div className="info-value">
            {'Notification' in window ? Notification.permission : 'not supported'}
          </div>
          <div className="info-label">PushManager</div>
          <div className="info-value">{'PushManager' in window ? 'available' : 'not available'}</div>
        </div>
        {'PushManager' in window && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <button
              className="btn btn-outline btn-full"
              onClick={async () => {
                const ok = await subscribeToPush();
                alert(ok ? 'Subscribed! Try sending a test notification.' : 'Subscribe failed — check console.');
              }}
            >
              Re-subscribe to push
            </button>
            <TestNotificationButton />
          </div>
        )}
      </section>
    </div>
  );
}
