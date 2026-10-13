import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "./AuthContext";
import { getMyLegalStudies, resetApiWorkContext, setApiWorkContext } from "../services/api";

const STORAGE_KEY = "luxia.studyContext.v2";

export type StudyContextSelection =
  | {
      type: "personal";
      legalStudyId: null;
      name: "Mis Casos";
    }
  | {
      type: "study";
      legalStudyId: string;
      name: string;
    };

type LegalStudyOption = {
  id: string;
  name: string;
  role?: string;
};

type StudyContextValue = {
  activeContext: StudyContextSelection;
  activeContextKey: string;
  activeLegalStudy: LegalStudyOption | null;
  isHydrated: boolean;
  isLoadingStudies: boolean;
  studiesError: string | null;
  legalStudies: LegalStudyOption[];
  refreshLegalStudies: () => Promise<void>;
  selectPersonalContext: () => void;
  selectStudyContext: (study: LegalStudyOption) => void;
};

const PERSONAL_CONTEXT: StudyContextSelection = {
  type: "personal",
  legalStudyId: null,
  name: "Mis Casos",
};

const StudyContext = createContext<StudyContextValue>({
  activeContext: PERSONAL_CONTEXT,
  activeContextKey: "personal",
  activeLegalStudy: null,
  isHydrated: false,
  isLoadingStudies: false,
  studiesError: null,
  legalStudies: [],
  refreshLegalStudies: async () => undefined,
  selectPersonalContext: () => undefined,
  selectStudyContext: () => undefined,
});

type StudyContextProviderProps = {
  children: ReactNode;
};

function getContextKey(context: StudyContextSelection) {
  return context.type === "study" && context.legalStudyId
    ? `study:${context.legalStudyId}`
    : "personal";
}

function normalizeStoredContext(value: unknown): StudyContextSelection {
  if (!value || typeof value !== "object") {
    return PERSONAL_CONTEXT;
  }

  const candidate = value as Partial<StudyContextSelection>;

  if (candidate.type === "study" && candidate.legalStudyId) {
    return {
      type: "study",
      legalStudyId: String(candidate.legalStudyId),
      name: String(candidate.name || "Estudio Juridico"),
    };
  }

  return PERSONAL_CONTEXT;
}

export function StudyContextProvider({ children }: StudyContextProviderProps) {
  const { authStatus, currentUser, isAuthReady } = useAuth();
  const [activeContext, setActiveContext] =
    useState<StudyContextSelection>(PERSONAL_CONTEXT);
  const [legalStudies, setLegalStudies] = useState<LegalStudyOption[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hydratedUserKey, setHydratedUserKey] = useState<string | null>(null);
  const [isLoadingStudies, setIsLoadingStudies] = useState(false);
  const [studiesError, setStudiesError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const legalStudiesRequestRef = useRef<Promise<void> | null>(null);
  const userKey = currentUser?.uid || null;
  const userKeyRef = useRef(userKey);
  userKeyRef.current = userKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setIsHydrated(false);
    setHydratedUserKey(null);
    setActiveContext(PERSONAL_CONTEXT);
    setLegalStudies([]);
    legalStudiesRequestRef.current = null;
    resetApiWorkContext();
    if (!isAuthReady || !userKey) {
      if (isAuthReady) setIsHydrated(true);
      return () => { mounted = false; };
    }

    AsyncStorage.getItem(`${STORAGE_KEY}.${userKey}`)
      .then((rawValue) => {
        if (!mounted || !rawValue) {
          return;
        }
        const restored = normalizeStoredContext(JSON.parse(rawValue));
        setApiWorkContext(restored);
        setActiveContext(restored);
      })
      .catch(() => {
        if (__DEV__) {
          console.warn("[StudyContext] No se pudo restaurar el contexto guardado.");
        }
      })
      .finally(() => {
        if (mounted) {
          setHydratedUserKey(userKey);
          setIsHydrated(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isAuthReady, userKey]);

  const persistContext = useCallback((nextContext: StudyContextSelection) => {
    if (!userKey) return;
    void AsyncStorage.setItem(`${STORAGE_KEY}.${userKey}`, JSON.stringify(nextContext)).catch(() => {
      if (__DEV__) {
        console.warn("[StudyContext] No se pudo guardar el contexto seleccionado.");
      }
    });
  }, [userKey]);

  const refreshLegalStudies = useCallback(async () => {
    if (!isAuthReady || authStatus === "initializing") {
      return;
    }

    if (!currentUser || authStatus === "unauthenticated") {
      setLegalStudies([]);
      setActiveContext(PERSONAL_CONTEXT);
      setStudiesError(null);
      return;
    }

    if (authStatus !== "authenticated") {
      setIsLoadingStudies(false);
      setStudiesError("No pudimos conectarnos. Revisá tu conexión e intentá nuevamente.");
      return;
    }

    if (legalStudiesRequestRef.current) {
      return legalStudiesRequestRef.current;
    }

    const requestPromise = (async () => {
      try {
        setIsLoadingStudies(true);
        setStudiesError(null);
        const studies = await getMyLegalStudies();

        if (!mountedRef.current || userKeyRef.current !== userKey) {
          return;
        }

        setLegalStudies(studies);

        setActiveContext((current) => {
          if (current.type !== "study") {
            return current;
          }

          const stillAvailable = studies.find(
            (study) => String(study.id) === String(current.legalStudyId)
          );

          if (!stillAvailable) {
            persistContext(PERSONAL_CONTEXT);
            return PERSONAL_CONTEXT;
          }

          const nextContext: StudyContextSelection = {
            type: "study",
            legalStudyId: String(stillAvailable.id),
            name: stillAvailable.name,
          };
          persistContext(nextContext);
          return nextContext;
        });
      } catch (error) {
        if (!mountedRef.current || userKeyRef.current !== userKey) {
          return;
        }

        if (__DEV__) {
          console.warn("[StudyContext] No se pudieron actualizar los estudios.");
        }
        setStudiesError(
          error && typeof error === "object" && "status" in error &&
            ((error as { status?: number }).status === 401 ||
              (error as { status?: number }).status === 403)
            ? "Tu sesión expiró. Iniciá sesión nuevamente."
            : "No pudimos conectarnos. Revisá tu conexión e intentá nuevamente."
        );
      } finally {
        if (mountedRef.current && userKeyRef.current === userKey) {
          setIsLoadingStudies(false);
        }
      }
    })();

    legalStudiesRequestRef.current = requestPromise;
    try {
      await requestPromise;
    } finally {
      if (legalStudiesRequestRef.current === requestPromise) {
        legalStudiesRequestRef.current = null;
      }
    }
  }, [authStatus, userKey, isAuthReady, persistContext]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    void refreshLegalStudies();
  }, [isHydrated, refreshLegalStudies]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    setApiWorkContext(activeContext);
  }, [activeContext, isHydrated]);

  const selectPersonalContext = useCallback(() => {
    setApiWorkContext(PERSONAL_CONTEXT);
    setActiveContext(PERSONAL_CONTEXT);
    persistContext(PERSONAL_CONTEXT);
  }, [persistContext]);

  const selectStudyContext = useCallback(
    (study: LegalStudyOption) => {
      const nextContext: StudyContextSelection = {
        type: "study",
        legalStudyId: String(study.id),
        name: study.name || "Estudio Juridico",
      };

      if (!legalStudies.some((option) => String(option.id) === nextContext.legalStudyId)) return;
      setApiWorkContext(nextContext);
      setActiveContext(nextContext);
      persistContext(nextContext);
    },
    [legalStudies, persistContext]
  );

  const contextReady = isHydrated && hydratedUserKey === userKey && Boolean(userKey);
  const activeContextKey = getContextKey(contextReady ? activeContext : PERSONAL_CONTEXT);
  const activeLegalStudy = useMemo(
    () =>
      contextReady && activeContext.type === "study"
        ? legalStudies.find((study) => String(study.id) === String(activeContext.legalStudyId)) ||
          { id: activeContext.legalStudyId, name: activeContext.name }
        : null,
    [activeContext, contextReady, legalStudies]
  );
  const value = useMemo(
    () => ({
      activeContext: contextReady ? activeContext : PERSONAL_CONTEXT,
      activeContextKey,
      activeLegalStudy,
      isHydrated: contextReady,
      isLoadingStudies,
      studiesError,
      legalStudies,
      refreshLegalStudies,
      selectPersonalContext,
      selectStudyContext,
    }),
    [
      activeContext,
      contextReady,
      activeContextKey,
      activeLegalStudy,
      isHydrated,
      isLoadingStudies,
      studiesError,
      legalStudies,
      refreshLegalStudies,
      selectPersonalContext,
      selectStudyContext,
    ]
  );

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}

export function useStudyContext() {
  return useContext(StudyContext);
}
