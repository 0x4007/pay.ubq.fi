import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';

// Get Supabase config from Vite env vars - needed for INIT
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  const workerRef = useRef<Worker | null>(null);
  const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);

  useEffect(() => {
    // Ensure env vars are present
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const errorMsg = "Supabase URL or Anon Key missing in frontend environment variables for worker initialization.";
      console.error(errorMsg);
      setWorkerError(errorMsg);
      setIsWorkerInitialized(false); // Ensure state reflects failure
      return; // Don't proceed
    }

    // Create worker instance
    workerRef.current = new Worker(new URL('../workers/permit-checker.worker.ts', import.meta.url), { type: 'module' });
    console.log("WorkerProvider: Permit checker worker created.");

    // Listener specifically for INIT confirmation or error
    const handleInitMessage = (event: MessageEvent) => {
      const { type, error } = event.data;
      if (type === 'INIT_SUCCESS') {
        console.log("WorkerProvider: Worker initialized successfully.");
        setIsWorkerInitialized(true);
        setWorkerError(null);
        // Remove this specific listener once initialized
        workerRef.current?.removeEventListener('message', handleInitMessage);
      } else if (type === 'INIT_ERROR') {
        console.error("WorkerProvider: Worker initialization failed:", error);
        setWorkerError(`Worker initialization failed: ${error}`);
        setIsWorkerInitialized(false);
        // Remove this specific listener on error too
        workerRef.current?.removeEventListener('message', handleInitMessage);
      }
      // Ignore other message types here
    };

    // Generic error handler
    const handleError = (event: ErrorEvent) => {
      console.error("WorkerProvider: Worker error:", event.message, event);
      setWorkerError(`Worker error: ${event.message}`);
      setIsWorkerInitialized(false); // Consider worker unusable on error
    };

    workerRef.current.addEventListener('message', handleInitMessage);
    workerRef.current.addEventListener('error', handleError);

    // Send INIT message
    console.log("WorkerProvider: Sending INIT message to worker...");
    workerRef.current.postMessage({
      type: 'INIT',
      payload: { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }
    });

    // Cleanup function
    return () => {
      console.log("WorkerProvider: Terminating permit checker worker.");
      workerRef.current?.removeEventListener('message', handleInitMessage); // Ensure listener removed
      workerRef.current?.removeEventListener('error', handleError);
      workerRef.current?.terminate();
      workerRef.current = null;
      setIsWorkerInitialized(false); // Reset state on unmount
      setWorkerError(null);
    };
  }, []); // Run only once on mount

  const value = {
    worker: workerRef.current,
    isWorkerInitialized,
    workerError
  };

  return <WorkerContext.Provider value={value}>{children}</WorkerContext.Provider>;
};
