const DEFAULT_API_BASE_URL = 'http://localhost:8081/api/v1';
const DEFAULT_WS_URL = 'http://localhost:8081/ws';
const DEFAULT_GOOGLE_CLIENT_ID = '264640047149-qrrlqpraqqsoj9tijuk55tndve952opu.apps.googleusercontent.com';

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

export const API_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
);

export const WS_URL = trimTrailingSlash(
  import.meta.env.VITE_WS_URL || DEFAULT_WS_URL
);

export const GOOGLE_CLIENT_ID = String(
  import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID
).trim();

export const isGoogleAuthConfigured = Boolean(GOOGLE_CLIENT_ID);
