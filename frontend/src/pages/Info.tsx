import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

interface BackendInfo {
  version: string;
  buildTime: string;
  environment: string;
  startedAt: string;
}

export default function Info() {
  const [backend, setBackend] = useState<BackendInfo | null>(null);
  const [error, setError] = useState('');
  const [swStatus, setSwStatus] = useState('checking...');

  useEffect(() => {
    fetch(`${API_URL}/info`)
      .then((res) => res.json())
      .then(setBackend)
      .catch(() => setError('Failed to reach API'));

    // Check service worker status
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) {
          setSwStatus('not registered');
        } else if (reg.waiting) {
          setSwStatus('update waiting');
        } else if (reg.active) {
          setSwStatus('active');
        } else if (reg.installing) {
          setSwStatus('installing');
        }
      });
    } else {
      setSwStatus('not supported');
    }
  }, []);

  function formatTime(iso: string): string {
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
          <div className="info-label">Service Worker</div>
          <div className="info-value">{swStatus}</div>
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
      </section>
    </div>
  );
}
