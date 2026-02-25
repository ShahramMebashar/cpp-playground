import type {
  RuntimeOutput,
  RuntimeExit,
  RuntimeError,
} from '../workers/runtime.worker';

import {
  STDIN_TOTAL_BYTES,
  STDIN_HEADER_BYTES,
  STDIN_SIGNAL_DATA,
  STDIN_SIGNAL_EOF,
} from './wasiRuntime';

type MessageFromWorker = RuntimeOutput | RuntimeExit | RuntimeError;

interface RuntimeCallbacks {
  onStdout: (data: string) => void;
  onStderr: (data: string) => void;
  onExit: (code: number) => void;
  onError: (message: string) => void;
}

/** Check once whether SharedArrayBuffer is available (requires cross-origin isolation). */
const sharedArrayBufferSupported = typeof SharedArrayBuffer !== 'undefined';

const encoder = new TextEncoder();

export class RuntimeBridge {
  private worker: Worker | null = null;
  private callbacks: RuntimeCallbacks;
  private stdinSignal: Int32Array | null = null;
  private stdinData: Uint8Array | null = null;

  constructor(callbacks: RuntimeCallbacks) {
    this.callbacks = callbacks;
  }

  run(wasmBinary: Uint8Array): string {
    this.terminate();

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

    // Create SharedArrayBuffer for stdin communication
    let stdinBuffer: SharedArrayBuffer | undefined;
    if (sharedArrayBufferSupported) {
      stdinBuffer = new SharedArrayBuffer(STDIN_TOTAL_BYTES);
      this.stdinSignal = new Int32Array(stdinBuffer, 0, 2);
      this.stdinData = new Uint8Array(stdinBuffer, STDIN_HEADER_BYTES);
    } else {
      this.stdinSignal = null;
      this.stdinData = null;
    }

    this.worker.postMessage({
      type: 'run',
      id,
      wasmBinary,
      stdinBuffer: stdinBuffer ?? new SharedArrayBuffer(STDIN_TOTAL_BYTES),
    });
    return id;
  }

  /** Write text to the program's stdin via SharedArrayBuffer. */
  sendStdin(data: string): void {
    if (!this.stdinSignal || !this.stdinData) return;

    const bytes = encoder.encode(data);
    const byteLength = bytes.byteLength;

    // Copy payload bytes into shared buffer (at offset STDIN_HEADER_BYTES)
    this.stdinData.set(bytes.subarray(0, this.stdinData.byteLength));

    // Set data length
    Atomics.store(this.stdinSignal, 1, byteLength);
    // Set signal flag to DATA
    Atomics.store(this.stdinSignal, 0, STDIN_SIGNAL_DATA);
    // Wake the worker
    Atomics.notify(this.stdinSignal, 0);
  }

  /** Signal EOF on stdin. */
  sendEof(): void {
    if (!this.stdinSignal) return;

    Atomics.store(this.stdinSignal, 0, STDIN_SIGNAL_EOF);
    Atomics.notify(this.stdinSignal, 0);
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.stdinSignal = null;
    this.stdinData = null;
  }
}
