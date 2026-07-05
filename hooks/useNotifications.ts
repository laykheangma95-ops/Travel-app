'use client';

import { useCallback, useState } from 'react';

export interface FlightAlertPreferences {
  gateChange: boolean;
  delay: boolean;
  boarding: boolean;
  landing: boolean;
  contact: string;
  language: 'km' | 'en';
}

export const defaultAlertPreferences: FlightAlertPreferences = {
  gateChange: true,
  delay: true,
  boarding: true,
  landing: true,
  contact: '',
  language: 'km',
};

interface UseNotificationsResult {
  saving: boolean;
  saved: boolean;
  registerAlerts: (flightNumber: string, date: string, prefs: FlightAlertPreferences) => Promise<boolean>;
}

export function useNotifications(): UseNotificationsResult {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const registerAlerts = useCallback(
    async (flightNumber: string, date: string, prefs: FlightAlertPreferences) => {
      setSaving(true);
      try {
        // Ask browser permission for web push when available (best effort).
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        const res = await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flightNumber, date, preferences: prefs }),
        });
        const ok = res.ok;
        setSaved(ok);
        return ok;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return { saving, saved, registerAlerts };
}
