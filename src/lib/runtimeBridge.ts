import type {
  RuntimeOutput,
  RuntimeExit,
  RuntimeError,
} from '../workers/runtime.worker';

type MessageFromWorker = RuntimeOutput | RuntimeExit | RuntimeError;

interface RuntimeCallbacks {
  onStdout: (data: string) => void;
  onStderr: (data: string) => void;
  onExit: (code: number) => void;
  onError: (message: string) => void;
}

export class RuntimeBridge {
  private worker: Worker | null = null;
  private callbacks: RuntimeCallbacks;

  constructor(callbacks: RuntimeCallbacks) {
    this.callbacks = callbacks;
  }

  run(wasmBinary: Uint8Array): string {
    this.worker?.terminate();

    this.worker = new Worker(
      new URL('../workers/runtime.worker.ts', import.meta.url),
      { type: 'module' },
    );

    const id = crypto.randomUUID();

    this.worker.onmessage = (e: MessageEvent<MessageFromWorker>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'stdout':
          this.callbacks.onStdout(msg.data);
          break;
        case 'stderr':
          this.callbacks.onStderr(msg.data);
          break;
        case 'exit':
          this.callbacks.onExit(msg.code);
          break;
        case 'runtime-error':
          this.callbacks.onError(msg.message);
          break;
      }
    };

    this.worker.postMessage({ type: 'run', id, wasmBinary });
    return id;
  }

  sendStdin(data: string) {
    this.worker?.postMessage({ type: 'stdin', data });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
  }
}
