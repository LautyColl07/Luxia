import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { WORK_CONTEXT_TYPES } from '../services/api';

const STORAGE_KEY = '@luxia/work-context';

export type ActiveWorkContext = {
  type: string;
  legalStudyId?: string | null;
};

type WorkContextValue = {
  activeContext: ActiveWorkContext;
  isReady: boolean;
  setActiveContext: (nextContext: ActiveWorkContext) => Promise<void>;
};

const DEFAULT_CONTEXT: ActiveWorkContext = {
  type: WORK_CONTEXT_TYPES.PERSONAL,
  legalStudyId: null,
};

const WorkContext = createContext<WorkContextValue>({
  activeContext: DEFAULT_CONTEXT,
  isReady: false,
  setActiveContext: async () => undefined,
});

type WorkContextProviderProps = {
  children: ReactNode;
};

export function WorkContextProvider({ children }: WorkContextProviderProps) {
  const [activeContext, setActiveContextState] = useState<ActiveWorkContext>(DEFAULT_CONTEXT);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedValue) => {
        if (!mounted || !storedValue) {
          return;
        }

        try {
          const parsed = JSON.parse(storedValue);

          if (parsed?.type) {
            setActiveContextState({
              type: parsed.type,
              legalStudyId: parsed.legalStudyId || null,
            });
          }
        } catch {
          setActiveContextState(DEFAULT_CONTEXT);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const setActiveContext = async (nextContext: ActiveWorkContext) => {
    const normalizedContext = {
      type: nextContext?.type || WORK_CONTEXT_TYPES.PERSONAL,
      legalStudyId: nextContext?.legalStudyId || null,
    };

    setActiveContextState(normalizedContext);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedContext));
  };

  const value = useMemo(
    () => ({
      activeContext,
      isReady,
      setActiveContext,
    }),
    [activeContext, isReady]
  );

  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
}

export function useWorkContext() {
  return useContext(WorkContext);
}

export function getCaseScopeFromWorkContext(activeContext: ActiveWorkContext) {
  if (activeContext?.type === WORK_CONTEXT_TYPES.LEGAL_STUDY) {
    return 'legal_study';
  }

  if (activeContext?.type === WORK_CONTEXT_TYPES.ALL) {
    return 'all';
  }

  return 'private';
}
