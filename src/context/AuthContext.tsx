import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { IS_CAPTURE_MODE } from "../config/captureMode";
import { localAuth, LocalUser } from "../services/localAuth";
import { setAuthState, setAuthToken } from "../services/api";

export type AuthStatus = "initializing" | "authenticated" | "unauthenticated" | "temporarilyOffline";
type AuthContextValue = { currentUser: LocalUser | null; isAuthReady: boolean; authStatus: AuthStatus };
const AuthContext = createContext<AuthContextValue>({ currentUser: null, isAuthReady: false, authStatus: "initializing" });
const CAPTURE_USER: LocalUser = { uid: "capture-user-local", email: "capturas@luxia.invalid", displayName: "Valentina Demo", getIdToken: async () => { throw new Error("El modo captura no usa tokens reales."); } };

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<LocalUser | null>(IS_CAPTURE_MODE ? CAPTURE_USER : localAuth.currentUser);
  const [isAuthReady, setIsAuthReady] = useState(IS_CAPTURE_MODE);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(IS_CAPTURE_MODE ? "authenticated" : "initializing");
  useEffect(() => {
    if (IS_CAPTURE_MODE) { setAuthToken(null); setAuthState("authenticated"); return; }
    let mounted = true;
    const update = (user: LocalUser | null) => {
      if (!mounted) return;
      setAuthToken(null);
      setAuthState(user ? "authenticated" : "unauthenticated");
      setCurrentUser(user); setAuthStatus(user ? "authenticated" : "unauthenticated"); setIsAuthReady(true);
    };
    const unsubscribe = localAuth.subscribe(update);
    void localAuth.restore().then(() => update(localAuth.currentUser));
    return () => { mounted = false; unsubscribe(); };
  }, []);
  const value = useMemo(() => ({ currentUser, isAuthReady, authStatus }), [currentUser, isAuthReady, authStatus]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export const useAuth = () => useContext(AuthContext);
