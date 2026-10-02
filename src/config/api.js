export const SERVER_IP = "172.16.4.251";
export const SERVER_PORT = 3000;
export const API_PORT = SERVER_PORT;
export const AI_PORT = 5000;

export function buildServerUrls(serverIp = SERVER_IP) {
  const apiRootUrl = `http://${serverIp}:${SERVER_PORT}`;

  return {
    API_ROOT_URL: apiRootUrl,
    API_BASE_URL: `${apiRootUrl}/api/v1`,
    AI_BASE_URL: `http://${serverIp}:${AI_PORT}`,
    SOCKET_URL: apiRootUrl,
  };
}

// SERVER_IP is the single source of truth for every frontend service URL.
// If the server changes, update only this constant and restart Expo.
const SERVER_URLS = buildServerUrls();

export const API_ROOT_URL = SERVER_URLS.API_ROOT_URL;
export const API_BASE_URL = SERVER_URLS.API_BASE_URL;
export const AI_BASE_URL = SERVER_URLS.AI_BASE_URL;
export const SOCKET_URL = SERVER_URLS.SOCKET_URL;
