import { createWasiImports, WasiExit } from '../lib/wasiRuntime';

export interface RunRequest {
  type: 'run';
  id: string;
  wasmBinary: Uint8Array;
  stdinBuffer: SharedArrayBuffer;
}

export interface StdinData {
  type: 'stdin';
  data: string;
}

export interface RuntimeOutput {
  type: 'stdout' | 'stderr';
  data: string;
}

export interface RuntimeExit {
  type: 'exit';
  id: string;
  code: number;
}

export interface RuntimeError {
  type: 'runtime-error';
  id: string;
  message: string;
}

type WorkerInput = RunRequest | StdinData;
type WorkerOutput = RuntimeOutput | RuntimeExit | RuntimeError;

function respond(msg: WorkerOutput) {
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  const msg = e.data;

  if (msg.type !== 'run') return;

  const { id, wasmBinary, stdinBuffer } = msg;
  let exitReported = false;

  const onStdout = (text: string) => respond({ type: 'stdout', data: text });
  const onStderr = (text: string) => respond({ type: 'stderr', data: text });
  const onExit = (code: number) => {
    exitReported = true;
    respond({ type: 'exit', id, code });
  };

  try {
    const module = await WebAssembly.compile(wasmBinary.buffer as ArrayBuffer);

    // Try with imported memory first
    let instance: WebAssembly.Instance;
    let memory = new WebAssembly.Memory({ initial: 256, maximum: 4096 });

    try {
      const wasiImports = createWasiImports(memory, {
        stdinBuffer,
        onStdout,
        onStderr,
        onExit,
      });
      instance = await WebAssembly.instantiate(module, {
        ...wasiImports,
        env: { memory },
      });
    } catch {
      // Module likely exports its own memory — instantiate without env.memory
      // Use a placeholder memory; we'll replace with the exported one below
      const tempMemory = new WebAssembly.Memory({ initial: 1 });
      const wasiImports = createWasiImports(tempMemory, {
        stdinBuffer,
        onStdout,
        onStderr,
        onExit,
      });
      instance = await WebAssembly.instantiate(module, wasiImports);

      // Use the module's exported memory
      if (instance.exports.memory instanceof WebAssembly.Memory) {
        memory = instance.exports.memory;
      }

      // Re-create WASI imports with the correct memory and re-instantiate
      const correctWasiImports = createWasiImports(memory, {
        stdinBuffer,
        onStdout,
        onStderr,
        onExit,
      });
      instance = await WebAssembly.instantiate(module, correctWasiImports);
    }

    // If the module exports its own memory, prefer it
    if (instance.exports.memory instanceof WebAssembly.Memory) {
      memory = instance.exports.memory;
    }

    (instance.exports._start as Function)();

    // _start returned normally without proc_exit
    if (!exitReported) {
      respond({ type: 'exit', id, code: 0 });
    }
  } catch (err) {
    if (err instanceof WasiExit) {
      // Normal exit — already reported via onExit callback
      return;
    }
    respond({
      type: 'runtime-error',
      id,
      message: err instanceof Error ? err.message : 'Unknown runtime error',
    });
  }
};
