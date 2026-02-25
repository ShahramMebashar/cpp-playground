import type { CompileResponse, StatusMessage } from '../workers/compiler.worker.ts';

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
    this.worker = this.createWorker();
  }

  private createWorker(): Worker {
    const worker = new Worker(
      new URL('../workers/compiler.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent<MessageFromWorker>) => {
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

    worker.onerror = (e) => {
      console.error('[CompilerBridge] Worker error:', e);
      for (const [id, pending] of this.pendingCompilations.entries()) {
        pending.resolve({
          type: 'compile-result',
          id,
          success: false,
          errors: [{ line: 1, column: 1, severity: 'error', message: 'Compiler worker crashed' }],
          stderr: 'Compiler worker crashed',
        });
      }
      this.pendingCompilations.clear();
      this.resetWorker();
    };

    return worker;
  }

  private resetWorker() {
    this.worker.terminate();
    this.worker = this.createWorker();
  }

  compile(code: string): Promise<CompileResponse> {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      this.pendingCompilations.set(id, { resolve });
      this.worker.postMessage({ type: 'compile', id, code });
    });
  }

  warmup() {
    this.worker.postMessage({ type: 'warmup' });
  }

  terminate() {
    this.worker.terminate();
  }
}
