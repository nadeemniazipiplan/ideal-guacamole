import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppStore';
import { hashPin, isValidPin } from '../lib/pin';

/**
 * Optional four-digit screen lock. Deliberately described as a *visual* lock
 * everywhere it appears - it does not encrypt anything.
 */
export function LockGate({ children }: { children: React.ReactNode }): JSX.Element {
  const { settings } = useApp();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    if (settings.pinEnabled && settings.pinHash) setLocked(true);
    else setLocked(false);
  }, [settings.pinEnabled, settings.pinHash]);

  useEffect(() => {
    if (!settings.pinEnabled || settings.autoLockMinutes <= 0) return undefined;
    const touch = () => {
      lastActivity.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'visibilitychange'] as const;
    for (const event of events) document.addEventListener(event, touch);
    const id = window.setInterval(() => {
      if (Date.now() - lastActivity.current > settings.autoLockMinutes * 60_000) setLocked(true);
    }, 15_000);
    return () => {
      for (const event of events) document.removeEventListener(event, touch);
      window.clearInterval(id);
    };
  }, [settings.pinEnabled, settings.autoLockMinutes]);

  if (!locked) return <>{children}</>;

  return (
    <div className="loading-screen">
      <form
        className="card"
        style={{ maxWidth: 340, width: '100%' }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!isValidPin(pin)) {
            setError('Enter your four-digit PIN.');
            return;
          }
          const hashed = await hashPin(pin);
          if (hashed === settings.pinHash) {
            setLocked(false);
            setPin('');
            setError('');
            lastActivity.current = Date.now();
          } else {
            setError('That PIN did not match.');
            setPin('');
          }
        }}
      >
        <h1>Locked</h1>
        <p className="small muted">
          Enter your four-digit PIN to continue. This is a screen lock only - it does not encrypt the data stored in
          this browser.
        </p>
        <div className="field">
          <label htmlFor="pin-input">PIN</label>
          <input
            id="pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'pin-error' : undefined}
          />
          {error && (
            <span className="error-text" id="pin-error" role="alert">
              {error}
            </span>
          )}
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 12 }}>
          Unlock
        </button>
      </form>
    </div>
  );
}
