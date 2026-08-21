import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "./AuthContext";
import { getMyLegalStudies, setApiWorkContext } from "../services/api";

const STORAGE_KEY = "luxia.studyContext.v1";

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
};

type StudyContextValue = {
  activeContext: StudyContextSelection;
  activeContextKey: string;
  activeLegalStudy: LegalStudyOption | null;
  isHydrated: boolean;
  isLoadingStudies: boolean;
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
  const { currentUser, isAuthReady } = useAuth();
  const [activeContext, setActiveContext] =
    useState<StudyContextSelection>(PERSONAL_CONTEXT);
  const [legalStudies, setLegalStudies] = useState<LegalStudyOption[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoadingStudies, setIsLoadingStudies] = useState(false);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((rawValue) => {
        if (!mounted || !rawValue) {
          return;
        }

        setActiveContext(normalizeStoredContext(JSON.parse(rawValue)));
      })
      .catch((error) => {
        console.error("[StudyContext] Error restaurando contexto:", error);
      })
      .finally(() => {
        if (mounted) {
          setIsHydrated(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const persistContext = useCallback((nextContext: StudyContextSelection) => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextContext)).catch((error) => {
      console.error("[StudyContext] Error persistiendo contexto:", error);
    });
  }, []);

  const refreshLegalStudies = useCallback(async () => {
    if (!isAuthReady || !currentUser) {
      setLegalStudies([]);
      setActiveContext(PERSONAL_CONTEXT);
      persistContext(PERSONAL_CONTEXT);
      return;
    }

    try {
      setIsLoadingStudies(true);
      const studies = await getMyLegalStudies();
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
      console.error("[StudyContext] Error cargando estudios juridicos:", error);
      setLegalStudies([]);
      setActiveContext(PERSONAL_CONTEXT);
      persistContext(PERSONAL_CONTEXT);
    } finally {
      setIsLoadingStudies(false);
    }
  }, [currentUser, isAuthReady, persistContext]);

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

      setActiveContext(nextContext);
      persistContext(nextContext);
    },
    [persistContext]
  );

  const activeContextKey = getContextKey(activeContext);
  const activeLegalStudy = useMemo(
    () =>
      activeContext.type === "study"
        ? legalStudies.find((study) => String(study.id) === String(activeContext.legalStudyId)) ||
          { id: activeContext.legalStudyId, name: activeContext.name }
        : null,
    [activeContext, legalStudies]
  );
  const value = useMemo(
    () => ({
      activeContext,
      activeContextKey,
      activeLegalStudy,
      isHydrated,
      isLoadingStudies,
      legalStudies,
      refreshLegalStudies,
      selectPersonalContext,
      selectStudyContext,
    }),
    [
      activeContext,
      activeContextKey,
      activeLegalStudy,
      isHydrated,
      isLoadingStudies,
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
