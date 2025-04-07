import type { WorkerContextProps } from '../context/worker-context.tsx';

declare global {
  interface Window {
    __MOCK_WORKER_CONTEXT__: WorkerContextProps & {
      worker: {
        postMessage: (data: unknown) => void;
        onmessage: ((this: Worker, ev: MessageEvent<unknown>) => void) | null;
        terminate: () => void;
      }
    };
    __MOCK_LEADERBOARD_DATA__: Array<{
      githubUsername: string;
      totalXp: number;
      xpByCategory: Record<string, number>;
      repositories: string[];
    }>;
  }
}
