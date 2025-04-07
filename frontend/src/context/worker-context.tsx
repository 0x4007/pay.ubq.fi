import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

// Get Supabase config and GitHub Token from Vite env vars
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN; // Read the GitHub token

// --- Module-level Worker Instance ---
let sharedWorker: Worker | null = null;
let workerInitializationState: 'idle' | 'initializing' | 'initialized' | 'error' = 'idle';
let initializationError: string | null = null;
const initializationListeners: Set<() => void> = new Set(); // To notify components when state changes

const initializeSharedWorker = () => {
  // Prevent re-initialization
  if (workerInitializationState !== 'idle') {
    console.log("WorkerContext Module: Initialization already attempted/done. State:", workerInitializationState);
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("WorkerContext Module: Missing Supabase credentials");
    initializationError = "Missing Supabase credentials";
    workerInitializationState = 'error';
    notifyListeners();
    return;
  }

  console.log("WorkerContext Module: Attempting worker initialization...");
  workerInitializationState = 'initializing';

  try {
    // Use the new unified worker file
    sharedWorker = new Worker(new URL('../workers/app-worker.ts', import.meta.url), { type: 'module' });
    console.log("WorkerContext Module: Shared worker instance created.");

    // Set a timeout for initialization
    const initTimeout = setTimeout(() => {
      if (workerInitializationState === 'initializing') {
        console.error("WorkerContext Module: Worker initialization timed out");
        initializationError = "Worker initialization timed out";
        workerInitializationState = 'error';
        notifyListeners();
      }
    }, 10000); // 10 second timeout

    const handleInitMessage = (event: MessageEvent) => {
      const { type, error } = event.data;
      console.log(`WorkerContext Module: Shared worker received message type: ${type}`);

      if (type === 'INIT_SUCCESS') {
        clearTimeout(initTimeout);
        console.log("WorkerContext Module: Shared worker initialized successfully.");
        workerInitializationState = 'initialized';
        initializationError = null;
        cleanupListeners();
        notifyListeners();
      } else if (type === 'INIT_ERROR') {
        clearTimeout(initTimeout);
        console.error("WorkerContext Module: Shared worker initialization failed:", error);
        initializationError = `Worker initialization failed: ${error}`;
        workerInitializationState = 'error';
        cleanupListeners();
        notifyListeners();
      }
    };

    const handleError = (event: ErrorEvent) => {
      clearTimeout(initTimeout);
      console.error("WorkerContext Module: Shared worker error:", event.message, event);
      initializationError = `Worker error: ${event.message}`;
      workerInitializationState = 'error';
      cleanupListeners();
      notifyListeners();
    };

    const cleanupListeners = () => {
      sharedWorker?.removeEventListener('message', handleInitMessage);
      sharedWorker?.removeEventListener('error', handleError);
    }

    sharedWorker.addEventListener('message', handleInitMessage);
    sharedWorker.addEventListener('error', handleError);

    // Verify Supabase credentials before sending INIT
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase URL or Anon Key missing.");
    }

    console.log("WorkerContext Module: Sending INIT message to shared worker...");
    console.log("WorkerContext Module: Sending INIT message to shared worker (including GitHub token if present)...");
    sharedWorker.postMessage({
      type: 'INIT',
      payload: {
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY,
        githubToken: GITHUB_TOKEN || null // Pass the token (or null if undefined/empty)
      }
    });

  } catch (e) {
    console.error("WorkerContext Module: Failed to create worker instance:", e);
    initializationError = `Failed to create worker instance: ${e instanceof Error ? e.message : String(e)}`;
    workerInitializationState = 'error';
    notifyListeners(); // Notify about the error state
  }
};

// Function to notify subscribed components about state changes
const notifyListeners = () => {
  initializationListeners.forEach(listener => listener());
}

// Initialize the worker when the module loads
initializeSharedWorker();

// --- React Context ---

interface WorkerContextProps {
  worker: Worker | null;
  isWorkerInitialized: boolean;
  workerError: string | null;
}

const WorkerContext = createContext<WorkerContextProps | undefined>(undefined);

export const useWorker = (): WorkerContextProps => {
  const context = useContext(WorkerContext);
  if (!context) {
    throw new Error('useWorker must be used within a WorkerProvider');
  }
  return context;
};

interface WorkerProviderProps {
  children: ReactNode;
}

export const WorkerProvider: React.FC<WorkerProviderProps> = ({ children }) => {
  // State reflects the module-level status
  const [isInitialized, setIsInitialized] = useState(workerInitializationState === 'initialized');
  const [error, setError] = useState(initializationError);

  useEffect(() => {
    // Callback to update state when notified
    const updateState = () => {
      console.log("WorkerProvider: Notified of worker state change. New state:", workerInitializationState);
      setIsInitialized(workerInitializationState === 'initialized');
      setError(initializationError);
    };

    // Subscribe to notifications
    initializationListeners.add(updateState);
    console.log("WorkerProvider: Subscribed to worker state changes.");

    // Initial check in case initialization finished before mount
    updateState();

    // Cleanup subscription on unmount
    return () => {
      console.log("WorkerProvider: Unsubscribing from worker state changes.");
      initializationListeners.delete(updateState);
    };
  }, []); // Run only once

  const value = {
    worker: sharedWorker,
    isWorkerInitialized: isInitialized,
    workerError: error
  };

  return <WorkerContext.Provider value={value}>{children}</WorkerContext.Provider>;
};
