export function setAuthToken(token: string | null): void;
export function syncRegister(
  payload: {
    firstName: string;
    lastName: string;
    name: string;
    displayName: string;
    username: string;
    matricula: string;
    estudioJuridico: string;
  },
  token?: string | null
): Promise<unknown>;
export function getDashboardBootstrap(options?: { force?: boolean }): Promise<{
  resumen: unknown;
  notificationCount: number;
}>;
export function preloadDashboardBootstrap(): Promise<unknown | null>;
export function sendLuxMessage(
  message: string,
  context?: Record<string, unknown>
): Promise<{ success: boolean; reply: string; raw?: unknown; error?: unknown }>;
