// Para cambiar de servidor, modificar solo SERVER_IP.
// export const SERVER_IP = "172.16.4.48";   //desmarcar esta linea cuando se trabaja en la escuela
export const SERVER_IP = "186.139.84.209";  //desmarcar esta linea cuando se trabaja fuera de la escuela 
export const API_PORT = "3000";
export const AI_PORT = "5000";

export const API_ROOT_URL = `http://${SERVER_IP}:${API_PORT}`;
export const API_BASE_URL = `http://${SERVER_IP}:${API_PORT}/api/v1`;
export const AI_BASE_URL = `http://${SERVER_IP}:${AI_PORT}`;
export const SOCKET_URL = `http://${SERVER_IP}:${API_PORT}`;
