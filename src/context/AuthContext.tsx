import { createContext, ReactNode, useContext } from "react";
import { User } from "firebase/auth";

type AuthContextValue = {
  currentUser: User | null;
  isAuthReady: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isAuthReady: false,
});

type AuthProviderProps = AuthContextValue & {
  children: ReactNode;
};

export const AuthProvider = ({
  children,
  currentUser,
  isAuthReady,
}: AuthProviderProps) => {
  return (
    <AuthContext.Provider value={{ currentUser, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
