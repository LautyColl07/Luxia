export function setAuthToken(token: string | null): void;
export function setAuthState(
  state: "initializing" | "authenticated" | "unauthenticated" | "temporarilyOffline"
): void;
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
export function getMyLegalStudies(): Promise<
  Array<{ id: string; name: string }>
>;
export function setApiWorkContext(context?: {
  type?: string;
  legalStudyId?: string | null;
  name?: string;
}): void;
export function getDashboardBootstrap(options?: { force?: boolean }): Promise<{
  resumen: unknown;
  notificationCount: number;
}>;
export function preloadDashboardBootstrap(): Promise<unknown | null>;
export function sendLuxMessage(
  message: string,
  context?: Record<string, unknown>
): Promise<{ success: boolean; reply: string; raw?: unknown; error?: unknown }>;
export function queryLegalAssistant(options: {
  question: string;
  conversationId?: string | null;
  signal?: AbortSignal;
}): Promise<unknown>;
export function sendGeneralLuxMessage(
  message: string,
  context?: Record<string, unknown>
): Promise<{ success: boolean; reply: string; raw?: unknown; error?: unknown }>;
export function normalizeLuxConversation(value?: unknown): {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  archived: boolean;
  pendingSync?: boolean;
  selectedCaseId?: string | null;
  selectedCaseName?: string | null;
  messages: Array<{ id: string; role: "user" | "assistant"; text: string; createdAt: string }>;
};
export function getLuxConversations(options?: Record<string, unknown>): Promise<unknown[]>;
export function createLuxConversation(payload?: Record<string, unknown>): Promise<unknown>;
export function getLuxConversation(conversationId: string): Promise<unknown>;
export function updateLuxConversation(conversationId: string, payload?: Record<string, unknown>): Promise<unknown>;
export function deleteLuxConversation(conversationId: string): Promise<unknown>;
export function searchLuxConversations(query: string, options?: Record<string, unknown>): Promise<unknown[]>;
export function getLuxMemory(options?: Record<string, unknown>): Promise<unknown[]>;
export function createLuxMemory(text: string): Promise<unknown>;
export function updateLuxMemory(memoryId: string, payload?: Record<string, unknown>): Promise<unknown>;
export function deleteLuxMemory(memoryId: string): Promise<unknown>;
