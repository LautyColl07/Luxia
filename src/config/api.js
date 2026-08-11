export const SERVER_IP = "172.16.4.48";
export const API_PORT = "3000";
export const AI_PORT = "5000";

const DEFAULT_API_URL = `http://${SERVER_IP}:${API_PORT}`;
const DEFAULT_AI_URL = `http://${SERVER_IP}:${AI_PORT}`;

export const API_ROOT_URL = DEFAULT_API_URL;

export const API_BASE_URL = `${API_ROOT_URL}/api/v1`;

export const AI_BASE_URL = DEFAULT_AI_URL;

export const SOCKET_URL = API_ROOT_URL;
