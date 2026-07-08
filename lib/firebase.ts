// Firebase Cloud Messaging integration.
// Server side we call the FCM HTTP v1 API directly so we don't need the full
// firebase-admin SDK; when FIREBASE_ADMIN_SDK isn't configured, notifications
// are logged and skipped.

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function getServiceAccount(): FirebaseServiceAccount | null {
  const raw = process.env.FIREBASE_ADMIN_SDK;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FirebaseServiceAccount;
  } catch {
    return null;
  }
}

export function isFirebaseConfigured(): boolean {
  return getServiceAccount() !== null;
}

async function getAccessToken(sa: FirebaseServiceAccount): Promise<string | null> {
  const { createSign } = await import('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url');
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function sendPushNotification(fcmToken: string, payload: PushPayload): Promise<boolean> {
  const sa = getServiceAccount();
  if (!sa) {
    console.info('[push:demo]', payload.title, '—', payload.body);
    return false;
  }
  const accessToken = await getAccessToken(sa);
  if (!accessToken) return false;
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title: payload.title, body: payload.body },
          webpush: payload.url ? { fcm_options: { link: payload.url } } : undefined,
        },
      }),
    }
  );
  return res.ok;
}

// Khmer notification templates for flight events.
export const notificationTemplates = {
  gateChange: (flight: string, oldGate: string, newGate: string) => ({
    km: {
      title: '✈️ Domer — ការផ្លាស់ប្តូរទ្វារ!',
      body: `ជើងហោះហើរ ${flight} ផ្លាស់ពីទ្វារ ${oldGate} ទៅ ${newGate}`,
    },
    en: {
      title: '✈️ Domer — Gate change!',
      body: `Flight ${flight} moved from gate ${oldGate} to ${newGate}`,
    },
  }),
  delay: (flight: string, minutes: number, newTime: string) => ({
    km: {
      title: '⏰ Domer — ជើងហោះហើរពន្យារពេល',
      body: `ជើងហោះហើរ ${flight} ពន្យារ ${minutes} នាទី។ ម៉ោងចេញថ្មី៖ ${newTime}`,
    },
    en: {
      title: '⏰ Domer — Flight delayed',
      body: `Flight ${flight} delayed ${minutes} min. New departure: ${newTime}`,
    },
  }),
  boarding: (flight: string, gate: string) => ({
    km: {
      title: '🛫 Domer — ចាប់ផ្តើមឡើងយន្តហោះ',
      body: `ជើងហោះហើរ ${flight} កំពុងឡើង នៅទ្វារ ${gate}`,
    },
    en: {
      title: '🛫 Domer — Boarding started',
      body: `Flight ${flight} is boarding at gate ${gate}`,
    },
  }),
  landed: (flight: string, city: string) => ({
    km: {
      title: '🎉 Domer — បានចុះចតហើយ',
      body: `ជើងហោះហើរ ${flight} បានមកដល់ ${city} ដោយសុវត្ថិភាព`,
    },
    en: {
      title: '🎉 Domer — Landed',
      body: `Flight ${flight} has arrived in ${city}`,
    },
  }),
};
