// El host y protocolo pueden fijarse al compilar sin incluir secretos.
export const SERVER_IP = process.env.EXPO_PUBLIC_LUXIA_SERVER_IP || "25.1.22.89";
export const API_PROTOCOL = process.env.EXPO_PUBLIC_LUXIA_API_PROTOCOL || "http";
export const API_PORT = process.env.EXPO_PUBLIC_LUXIA_API_PORT || "3000";
export const AI_PORT = process.env.EXPO_PUBLIC_LUXIA_AI_PORT || "5000";

export const API_ROOT_URL = `${API_PROTOCOL}://${SERVER_IP}:${API_PORT}`;
export const API_BASE_URL = `${API_ROOT_URL}/api/v1`;
export const AI_BASE_URL = `${API_PROTOCOL}://${SERVER_IP}:${AI_PORT}`;
export const SOCKET_URL = API_ROOT_URL;
