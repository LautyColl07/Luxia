import { Platform } from 'react-native';

// Docker Desktop publishes the backend on the host at port 8080. Android's
// emulator reaches the host through 10.0.2.2; web and iOS simulator use localhost.
export const SERVER_IP =
  (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
export const SERVER_PORT = 8080;
export const API_PORT = SERVER_PORT;
// Whisper is private to Docker Compose. Voice requests go through the backend API.
export const AI_PORT = 5000;

function normalizeApiRoot(value, serverPort) {
  const candidate = String(value || '').trim();
  if (/^https?:\/\//i.test(candidate)) return candidate.replace(/\/+$/, '');
  return `http://${candidate || 'localhost'}:${serverPort}`;
}

export function buildServerUrls(serverIp = SERVER_IP, serverPort = SERVER_PORT) {
  const apiRootUrl = normalizeApiRoot(serverIp, serverPort);

  return {
    API_ROOT_URL: apiRootUrl,
    API_BASE_URL: `${apiRootUrl}/api/v1`,
    // Compatibility alias: clients must use the API routes, not internal Whisper.
    AI_BASE_URL: apiRootUrl,
    SOCKET_URL: apiRootUrl,
  };
}

const configuredApiRoot = process.env.EXPO_PUBLIC_API_ROOT_URL;
const SERVER_URLS = buildServerUrls(configuredApiRoot || SERVER_IP);

export const API_ROOT_URL = SERVER_URLS.API_ROOT_URL;
export const API_BASE_URL = SERVER_URLS.API_BASE_URL;
export const AI_BASE_URL = SERVER_URLS.AI_BASE_URL;
export const SOCKET_URL = SERVER_URLS.SOCKET_URL;
