import type { CompileResponse, StatusMessage } from '../workers/compiler.worker';

type MessageFromWorker = CompileResponse | StatusMessage;

export class CompilerBridge {
  private worker: Worker;
  private pendingCompilations = new Map<
    string,
    { resolve: (res: CompileResponse) => void }
  >();
  private onStatusChange?: (status: StatusMessage) => void;

  constructor(onStatusChange?: (status: StatusMessage) => void) {
    this.onStatusChange = onStatusChange;
    this.worker = new Worker(
      new URL('../workers/compiler.worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = (e: MessageEvent<MessageFromWorker>) => {
      const msg = e.data;
      if (msg.type === 'status') {
        this.onStatusChange?.(msg);
      } else if (msg.type === 'compile-result') {
        const pending = this.pendingCompilations.get(msg.id);
        if (pending) {
          pending.resolve(msg);
          this.pendingCompilations.delete(msg.id);
        }
      }
    };
  }

  compile(code: string): Promise<CompileResponse> {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      this.pendingCompilations.set(id, { resolve });
      this.worker.postMessage({ type: 'compile', id, code });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
