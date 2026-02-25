import { createWasiImports, WasiExit, type MemoryRef } from '../lib/wasiRuntime';

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
    const wasmBuffer = new Uint8Array(wasmBinary).buffer;
    const module = await WebAssembly.compile(wasmBuffer);
    const moduleImports = WebAssembly.Module.imports(module);
    const needsEnvMemory = moduleImports.some(
      (imp) => imp.module === 'env' && imp.name === 'memory',
    );

    // Mutable ref so WASI functions always see the correct memory
    const memoryRef: MemoryRef = {
      current: new WebAssembly.Memory({ initial: 256, maximum: 4096 }),
    };

    const wasiImports = createWasiImports(memoryRef, {
      stdinBuffer,
      onStdout,
      onStderr,
      onExit,
    });

    const wasiModule = wasiImports.wasi_snapshot_preview1;

    const importObject: WebAssembly.Imports = {
      wasi_snapshot_preview1: wasiModule,
      wasi_unstable: wasiModule,
      env: needsEnvMemory ? { memory: memoryRef.current } : {},
    };

    const instance = await WebAssembly.instantiate(module, importObject);

    // If the module exports its own memory, point the ref at it
    // so all WASI syscalls read/write the correct buffer.
    if (instance.exports.memory instanceof WebAssembly.Memory) {
      memoryRef.current = instance.exports.memory;
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
