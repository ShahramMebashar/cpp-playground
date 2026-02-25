import type { LspResponse } from '../workers/lsp.worker';

interface DiagnosticsCallback {
  (diagnostics: Array<{
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
  }>): void;
}

export class LspClient {
  private worker: Worker;
  private pending = new Map<string, { resolve: (data: unknown) => void }>();
  private onDiagnostics?: DiagnosticsCallback;
  private onStatusChange?: (status: string) => void;

  constructor(opts?: {
    onDiagnostics?: DiagnosticsCallback;
    onStatusChange?: (status: string) => void;
  }) {
    this.onDiagnostics = opts?.onDiagnostics;
    this.onStatusChange = opts?.onStatusChange;

    this.worker = new Worker(
      new URL('../workers/lsp.worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = (e: MessageEvent<LspResponse>) => {
      const msg = e.data;

      if (msg.type === 'status') {
        this.onStatusChange?.((msg.data as { status: string }).status);
      } else if (msg.type === 'diagnostics') {
        this.onDiagnostics?.(msg.data as any);
      } else if (msg.id) {
        const pending = this.pending.get(msg.id);
        if (pending) {
          pending.resolve(msg.data);
          this.pending.delete(msg.id);
        }
      }
    };
  }

  didChange(content: string) {
    this.worker.postMessage({ type: 'didChange', params: { content } });
  }

  async completion(line: number, column: number) {
    return this.request('completion', { line, column });
  }

  async hover(line: number, column: number) {
    return this.request('hover', { line, column });
  }

  async definition(line: number, column: number) {
    return this.request('definition', { line, column });
  }

  private request(type: string, params: unknown): Promise<unknown> {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.worker.postMessage({ type, id, params });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
