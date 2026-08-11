import { createContext, ReactNode, useContext, useMemo } from "react";
import { User } from "firebase/auth";

import { setAuthState, setAuthToken } from "../services/api";

export type AuthStatus =
  | "initializing"
  | "authenticated"
  | "unauthenticated"
  | "temporarilyOffline";

type AuthContextValue = {
  currentUser: User | null;
  isAuthReady: boolean;
  authStatus: AuthStatus;
};

const DEMO_USER = {
  uid: "demo-martina-fernandez",
  email: "martina.fernandez@luxia.demo",
  displayName: "Martina Fernandez",
  emailVerified: true,
  isAnonymous: false,
  phoneNumber: null,
  photoURL: null,
  providerData: [],
  providerId: "demo",
  metadata: {},
  refreshToken: "",
  tenantId: null,
  delete: async () => undefined,
  getIdToken: async () => "demo-static-token",
  getIdTokenResult: async () => ({}),
  reload: async () => undefined,
  toJSON: () => ({
    uid: "demo-martina-fernandez",
    email: "martina.fernandez@luxia.demo",
    displayName: "Martina Fernandez",
  }),
} as unknown as User;

const AuthContext = createContext<AuthContextValue>({
  currentUser: DEMO_USER,
  isAuthReady: true,
  authStatus: "authenticated",
});

type AuthProviderProps = { children: ReactNode };

export const AuthProvider = ({ children }: AuthProviderProps) => {
  setAuthToken("demo-static-token");
  setAuthState("authenticated");

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser: DEMO_USER,
      isAuthReady: true,
      authStatus: "authenticated",
    }),
    []
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
