export const SERVER_IP: string;
export const SERVER_PORT: number;
export const API_PORT: number;
export const AI_PORT: number;
export const API_ROOT_URL: string;
export const API_BASE_URL: string;
export const AI_BASE_URL: string;
export const SOCKET_URL: string;
export function buildServerUrls(serverIp?: string): {
  API_ROOT_URL: string;
  API_BASE_URL: string;
  AI_BASE_URL: string;
  SOCKET_URL: string;
};
