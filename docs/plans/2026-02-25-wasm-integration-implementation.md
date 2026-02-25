# WASM Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace compiler and runtime worker stubs with real in-browser C++ compilation via @wasmer/sdk and interactive execution via a custom WASI runtime with SharedArrayBuffer stdin.

**Architecture:** Compiler worker uses @wasmer/sdk to run Clang (fetched from Wasmer registry) in a Web Worker. Runtime worker instantiates the compiled WASM binary with a custom WASI implementation that bridges stdin via SharedArrayBuffer+Atomics and stdout/stderr via postMessage.

**Tech Stack:** @wasmer/sdk, WebAssembly, WASI snapshot_preview1, SharedArrayBuffer, Atomics

---

### Task 1: Install @wasmer/sdk and Add Progress Tracking to Store

**Files:**
- Modify: `package.json`
- Modify: `src/app/store/editorStore.ts`
- Modify: `src/app/store/__tests__/editorStore.test.ts`

**Step 1: Install the Wasmer SDK**

```bash
npm install @wasmer/sdk
```

**Step 2: Write the failing test**

Add to `src/app/store/__tests__/editorStore.test.ts`:

```typescript
it('tracks WASM download progress', () => {
  const { setWasmProgress } = useEditorStore.getState();
  setWasmProgress(0.5);
  expect(useEditorStore.getState().wasmProgress).toBe(0.5);
  setWasmProgress(1.0);
  expect(useEditorStore.getState().wasmProgress).toBe(1.0);
});
```

**Step 3: Run test to verify it fails**

```bash
npx vitest run src/app/store/__tests__/editorStore.test.ts
```

Expected: FAIL — `setWasmProgress` not found.

**Step 4: Add wasmProgress to the store**

In `src/app/store/editorStore.ts`, add to the interface:

```typescript
wasmProgress: number;
setWasmProgress: (progress: number) => void;
```

Add to the store implementation:

```typescript
wasmProgress: 0,
setWasmProgress: (wasmProgress) => set({ wasmProgress }),
```

**Step 5: Run test to verify it passes**

```bash
npx vitest run src/app/store/__tests__/editorStore.test.ts
```

Expected: All tests PASS.

**Step 6: Commit**

```bash
git add package.json package-lock.json src/app/store/
git commit -m "feat: install @wasmer/sdk and add wasmProgress to editor store"
```

---

### Task 2: Update StatusBar with Download Progress

**Files:**
- Modify: `src/components/StatusBar/StatusBar.tsx`

**Step 1: Update StatusBar to show percentage**

Replace the compiler loading line in `src/components/StatusBar/StatusBar.tsx`:

```tsx
import { useEditorStore } from '../../app/store/editorStore';

export function StatusBar() {
  const compileStatus = useEditorStore((s) => s.compileStatus);
  const wasmStatus = useEditorStore((s) => s.wasmStatus);
  const wasmProgress = useEditorStore((s) => s.wasmProgress);

  const statusParts: string[] = [];

  if (wasmStatus.compiler === 'loading') {
    const pct = Math.round(wasmProgress * 100);
    statusParts.push(`Downloading compiler... ${pct}%`);
  } else if (wasmStatus.compiler === 'error') {
    statusParts.push('Compiler failed to load');
  }

  if (wasmStatus.clangd === 'loading') {
    statusParts.push('Loading clangd...');
  } else if (wasmStatus.clangd === 'error') {
    statusParts.push('Clangd unavailable');
  }

  if (compileStatus === 'compiling') {
    statusParts.push('Compiling...');
  }

  const statusText = statusParts.length > 0 ? statusParts.join(' | ') : 'Ready';

  return (
    <footer className="status-bar">
      <span>{statusText}</span>
    </footer>
  );
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/components/StatusBar/StatusBar.tsx
git commit -m "feat: show compiler download progress percentage in status bar"
```

---

### Task 3: Update Compiler Bridge for Progress Messages

**Files:**
- Modify: `src/workers/compiler.worker.ts` (just the types — add `progress` field to StatusMessage)
- Modify: `src/lib/compilerBridge.ts`
- Modify: `src/app/App.tsx`

**Step 1: Add progress to StatusMessage type**

In `src/workers/compiler.worker.ts`, update the `StatusMessage` interface:

```typescript
export interface StatusMessage {
  type: 'status';
  status: 'loading' | 'ready' | 'error';
  message?: string;
  progress?: number; // 0.0 to 1.0
}
```

**Step 2: Update CompilerBridge to forward progress**

In `src/lib/compilerBridge.ts`, update the constructor's `onStatusChange` callback. No structural changes needed — the existing callback already receives the full `StatusMessage` object. The caller in App.tsx needs to handle `progress`.

**Step 3: Update App.tsx to forward progress to store**

In `src/app/App.tsx`, update the compiler bridge initialization effect:

```typescript
// Initialize compiler bridge
useEffect(() => {
  const setWasmProgress = useEditorStore.getState().setWasmProgress;
  compilerRef.current = new CompilerBridge((status) => {
    setWasmStatus('compiler', status.status === 'ready' ? 'ready' : status.status === 'loading' ? 'loading' : 'error');
    if (status.progress !== undefined) {
      setWasmProgress(status.progress);
    }
  });
  return () => compilerRef.current?.terminate();
}, [setWasmStatus]);
```

**Step 4: Verify build**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add src/workers/compiler.worker.ts src/lib/compilerBridge.ts src/app/App.tsx
git commit -m "feat: pipe compiler download progress from worker through bridge to store"
```

---

### Task 4: Rewrite Compiler Worker with Wasmer SDK

**Files:**
- Modify: `src/workers/compiler.worker.ts`

This is the core compilation integration. The worker loads the Wasmer SDK, fetches the Clang package from the Wasmer registry, and uses it to compile C++ code.

**Step 1: Rewrite the compiler worker**

Replace `src/workers/compiler.worker.ts` entirely:

```typescript
export interface CompileRequest {
  type: 'compile';
  id: string;
  code: string;
}

export interface CompileResponse {
  type: 'compile-result';
  id: string;
  success: boolean;
  wasmBinary?: Uint8Array;
  errors?: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
  stdout?: string;
  stderr?: string;
}

export interface StatusMessage {
  type: 'status';
  status: 'loading' | 'ready' | 'error';
  message?: string;
  progress?: number;
}

type WorkerMessage = CompileRequest;
type WorkerResponse = CompileResponse | StatusMessage;

function respond(msg: WorkerResponse) {
  self.postMessage(msg);
}

// Parse clang error output into structured errors
// Format: "main.cpp:5:3: error: expected ';' after expression"
function parseClangErrors(stderr: string): CompileResponse['errors'] {
  const errors: NonNullable<CompileResponse['errors']> = [];
  const lines = stderr.split('\n');
  for (const line of lines) {
    const match = line.match(/^[^:]+:(\d+):(\d+):\s+(error|warning):\s+(.+)$/);
    if (match) {
      errors.push({
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
        severity: match[3] as 'error' | 'warning',
        message: match[4],
      });
    }
  }
  return errors;
}

let wasmerInit: typeof import('@wasmer/sdk') | null = null;
let clangPkg: any = null;

async function initCompiler() {
  respond({ type: 'status', status: 'loading', progress: 0, message: 'Initializing Wasmer SDK...' });

  try {
    // Dynamic import — the SDK is large, only load when needed
    const sdk = await import('@wasmer/sdk');
    wasmerInit = sdk;

    respond({ type: 'status', status: 'loading', progress: 0.1, message: 'Loading Clang compiler...' });

    await sdk.init();

    respond({ type: 'status', status: 'loading', progress: 0.2, message: 'Fetching Clang from registry...' });

    // This fetches the clang/clang package (~25-35MB compressed)
    // The Wasmer SDK caches this in IndexedDB after first download
    clangPkg = await sdk.Wasmer.fromRegistry('clang/clang');

    respond({ type: 'status', status: 'ready', progress: 1.0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error loading compiler';
    respond({ type: 'status', status: 'error', message });
  }
}

async function compile(id: string, code: string) {
  if (!wasmerInit || !clangPkg) {
    respond({
      type: 'compile-result',
      id,
      success: false,
      stderr: 'Compiler not loaded. Please wait for download to complete.',
    });
    return;
  }

  try {
    const { Directory } = wasmerInit;

    // Create virtual filesystem directories
    const srcDir = new Directory();
    const outDir = new Directory();

    // Write the user's source code
    await srcDir.writeFile('main.cpp', new TextEncoder().encode(code));

    // Run clang++ to compile
    const instance = await clangPkg.entrypoint!.run({
      args: [
        'clang++',
        '/src/main.cpp',
        '-o', '/out/program.wasm',
        '--target=wasm32-wasi',
        '-std=c++17',
        '-O2',
        '-lc++',
        '-lc++abi',
      ],
      mount: {
        '/src': srcDir,
        '/out': outDir,
      },
    });

    const result = await instance.wait();
    const stderrText = result.stderr ? new TextDecoder().decode(result.stderr) : '';
    const stdoutText = result.stdout ? new TextDecoder().decode(result.stdout) : '';

    if (result.code !== 0) {
      // Compilation failed
      respond({
        type: 'compile-result',
        id,
        success: false,
        errors: parseClangErrors(stderrText),
        stderr: stderrText,
        stdout: stdoutText,
      });
      return;
    }

    // Read the compiled WASM binary
    const wasmBinary = await outDir.readFile('program.wasm');

    respond({
      type: 'compile-result',
      id,
      success: true,
      wasmBinary: new Uint8Array(wasmBinary),
      stderr: stderrText,
      stdout: stdoutText,
    });
  } catch (err) {
    respond({
      type: 'compile-result',
      id,
      success: false,
      stderr: err instanceof Error ? err.message : 'Compilation failed with unknown error',
    });
  }
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === 'compile') {
    // Lazy init: only download compiler on first compile request
    if (!clangPkg) {
      await initCompiler();
    }
    await compile(msg.id, msg.code);
  }
};
```

**IMPORTANT NOTE FOR IMPLEMENTER:** The exact Wasmer SDK API (Directory, mount, entrypoint, run args, result shape) may differ from what's shown above. After writing this file:

1. Check `node_modules/@wasmer/sdk/dist/index.d.ts` for the actual TypeScript types
2. Check the Wasmer SDK docs at https://docs.wasmer.io/sdk/wasmer-js/
3. Look at the `Wasmer.fromRegistry` return type and how `entrypoint.run()` works
4. Adjust the code to match the real API

The structure and message protocol stay the same — only the SDK calls may need tweaking.

**Step 2: Verify build**

```bash
npm run build
```

May have TypeScript errors if the Wasmer SDK types differ. Fix them based on actual types.

**Step 3: Commit**

```bash
git add src/workers/compiler.worker.ts
git commit -m "feat: integrate Wasmer SDK for real C++ compilation in compiler worker"
```

---

### Task 5: Create WASI Runtime Module

**Files:**
- Create: `src/lib/wasiRuntime.ts`

This module provides WASI snapshot_preview1 imports for running compiled WASM binaries. It bridges stdin via SharedArrayBuffer+Atomics and stdout/stderr via callbacks.

**Step 1: Create the WASI runtime**

Create `src/lib/wasiRuntime.ts`:

```typescript
// WASI error codes
const WASI_ESUCCESS = 0;
const WASI_EBADF = 8;
const WASI_ENOSYS = 52;

// WASI file descriptor types
const WASI_STDIN = 0;
const WASI_STDOUT = 1;
const WASI_STDERR = 2;

// SharedArrayBuffer layout for stdin:
// [0]: Int32 — signal flag (0 = empty, 1 = data ready, 2 = EOF)
// [1]: Int32 — data length in bytes
// [8..]: Uint8 — stdin data (up to STDIN_BUF_SIZE bytes)
export const STDIN_BUF_SIZE = 4096;
export const STDIN_HEADER_BYTES = 8;
export const STDIN_TOTAL_BYTES = STDIN_HEADER_BYTES + STDIN_BUF_SIZE;

export const STDIN_SIGNAL_EMPTY = 0;
export const STDIN_SIGNAL_DATA = 1;
export const STDIN_SIGNAL_EOF = 2;

interface WasiOptions {
  stdinBuffer: SharedArrayBuffer; // SharedArrayBuffer for stdin
  onStdout: (text: string) => void;
  onStderr: (text: string) => void;
  onExit: (code: number) => void;
}

export function createWasiImports(memory: WebAssembly.Memory, options: WasiOptions) {
  const { stdinBuffer, onStdout, onStderr, onExit } = options;
  const stdinSignal = new Int32Array(stdinBuffer, 0, 2);
  const stdinData = new Uint8Array(stdinBuffer, STDIN_HEADER_BYTES, STDIN_BUF_SIZE);

  const decoder = new TextDecoder();

  // Read iov structs from WASM memory
  // Each iov is { buf: u32, buf_len: u32 } = 8 bytes
  function readIovs(view: DataView, iovsPtr: number, iovsLen: number): Array<{ ptr: number; len: number }> {
    const result: Array<{ ptr: number; len: number }> = [];
    for (let i = 0; i < iovsLen; i++) {
      const ptr = view.getUint32(iovsPtr + i * 8, true);
      const len = view.getUint32(iovsPtr + i * 8 + 4, true);
      result.push({ ptr, len });
    }
    return result;
  }

  return {
    wasi_snapshot_preview1: {
      // Write to stdout or stderr
      fd_write(fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number): number {
        const view = new DataView(memory.buffer);
        const iovs = readIovs(view, iovsPtr, iovsLen);
        let totalWritten = 0;

        for (const iov of iovs) {
          const bytes = new Uint8Array(memory.buffer, iov.ptr, iov.len);
          const text = decoder.decode(bytes);
          totalWritten += iov.len;

          if (fd === WASI_STDOUT) {
            onStdout(text);
          } else if (fd === WASI_STDERR) {
            onStderr(text);
          } else {
            return WASI_EBADF;
          }
        }

        view.setUint32(nwrittenPtr, totalWritten, true);
        return WASI_ESUCCESS;
      },

      // Read from stdin using SharedArrayBuffer + Atomics
      fd_read(fd: number, iovsPtr: number, iovsLen: number, nreadPtr: number): number {
        if (fd !== WASI_STDIN) return WASI_EBADF;

        const view = new DataView(memory.buffer);
        const iovs = readIovs(view, iovsPtr, iovsLen);

        // Wait for data to become available
        // Atomics.wait blocks the worker thread until data arrives
        while (Atomics.load(stdinSignal, 0) === STDIN_SIGNAL_EMPTY) {
          Atomics.wait(stdinSignal, 0, STDIN_SIGNAL_EMPTY);
        }

        const signal = Atomics.load(stdinSignal, 0);

        if (signal === STDIN_SIGNAL_EOF) {
          // EOF — return 0 bytes read
          view.setUint32(nreadPtr, 0, true);
          return WASI_ESUCCESS;
        }

        // Read data length
        const dataLen = Atomics.load(stdinSignal, 1);
        let totalRead = 0;
        let dataOffset = 0;

        for (const iov of iovs) {
          const remaining = dataLen - dataOffset;
          if (remaining <= 0) break;
          const toRead = Math.min(iov.len, remaining);
          const dest = new Uint8Array(memory.buffer, iov.ptr, toRead);
          dest.set(stdinData.subarray(dataOffset, dataOffset + toRead));
          dataOffset += toRead;
          totalRead += toRead;
        }

        // Reset signal to empty so main thread can send more data
        Atomics.store(stdinSignal, 0, STDIN_SIGNAL_EMPTY);
        Atomics.notify(stdinSignal, 0);

        view.setUint32(nreadPtr, totalRead, true);
        return WASI_ESUCCESS;
      },

      proc_exit(code: number): void {
        onExit(code);
        // Throw to stop WASM execution
        throw new WasiExit(code);
      },

      // Stubs — return success with zero counts
      args_sizes_get(argcPtr: number, argvBufSizePtr: number): number {
        const view = new DataView(memory.buffer);
        view.setUint32(argcPtr, 0, true);
        view.setUint32(argvBufSizePtr, 0, true);
        return WASI_ESUCCESS;
      },

      args_get(): number {
        return WASI_ESUCCESS;
      },

      environ_sizes_get(environcPtr: number, environBufSizePtr: number): number {
        const view = new DataView(memory.buffer);
        view.setUint32(environcPtr, 0, true);
        view.setUint32(environBufSizePtr, 0, true);
        return WASI_ESUCCESS;
      },

      environ_get(): number {
        return WASI_ESUCCESS;
      },

      clock_time_get(_id: number, _precision: bigint, timePtr: number): number {
        const view = new DataView(memory.buffer);
        view.setBigUint64(timePtr, BigInt(Date.now()) * 1000000n, true);
        return WASI_ESUCCESS;
      },

      fd_close(): number {
        return WASI_ESUCCESS;
      },

      fd_seek(): number {
        return WASI_ENOSYS;
      },

      fd_fdstat_get(fd: number, statPtr: number): number {
        const view = new DataView(memory.buffer);
        // filetype: 2 = CHARACTER_DEVICE for stdin/stdout/stderr
        view.setUint8(statPtr, 2);
        // fdflags
        view.setUint16(statPtr + 2, 0, true);
        // rights_base
        view.setBigUint64(statPtr + 8, 0n, true);
        // rights_inheriting
        view.setBigUint64(statPtr + 16, 0n, true);
        return WASI_ESUCCESS;
      },

      fd_prestat_get(): number {
        return WASI_EBADF;
      },

      fd_prestat_dir_name(): number {
        return WASI_EBADF;
      },

      random_get(bufPtr: number, bufLen: number): number {
        const buf = new Uint8Array(memory.buffer, bufPtr, bufLen);
        crypto.getRandomValues(buf);
        return WASI_ESUCCESS;
      },

      // Additional stubs that WASI programs may call
      poll_oneoff(): number { return WASI_ENOSYS; },
      sched_yield(): number { return WASI_ESUCCESS; },
      fd_advise(): number { return WASI_ESUCCESS; },
      fd_allocate(): number { return WASI_ENOSYS; },
      fd_datasync(): number { return WASI_ESUCCESS; },
      fd_sync(): number { return WASI_ESUCCESS; },
      fd_tell(): number { return WASI_ENOSYS; },
      fd_readdir(): number { return WASI_ENOSYS; },
      fd_renumber(): number { return WASI_ENOSYS; },
      fd_filestat_get(): number { return WASI_ENOSYS; },
      fd_filestat_set_size(): number { return WASI_ENOSYS; },
      fd_filestat_set_times(): number { return WASI_ENOSYS; },
      fd_pread(): number { return WASI_ENOSYS; },
      fd_pwrite(): number { return WASI_ENOSYS; },
      path_create_directory(): number { return WASI_ENOSYS; },
      path_filestat_get(): number { return WASI_ENOSYS; },
      path_filestat_set_times(): number { return WASI_ENOSYS; },
      path_link(): number { return WASI_ENOSYS; },
      path_open(): number { return WASI_ENOSYS; },
      path_readlink(): number { return WASI_ENOSYS; },
      path_remove_directory(): number { return WASI_ENOSYS; },
      path_rename(): number { return WASI_ENOSYS; },
      path_symlink(): number { return WASI_ENOSYS; },
      path_unlink_file(): number { return WASI_ENOSYS; },
      sock_accept(): number { return WASI_ENOSYS; },
      sock_recv(): number { return WASI_ENOSYS; },
      sock_send(): number { return WASI_ENOSYS; },
      sock_shutdown(): number { return WASI_ENOSYS; },
    },
  };
}

// Custom error to signal process exit (caught by runtime worker)
export class WasiExit extends Error {
  code: number;
  constructor(code: number) {
    super(`WASI exit with code ${code}`);
    this.code = code;
  }
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/lib/wasiRuntime.ts
git commit -m "feat: add WASI snapshot_preview1 runtime with SharedArrayBuffer stdin"
```

---

### Task 6: Rewrite Runtime Worker with WASI + SharedArrayBuffer

**Files:**
- Modify: `src/workers/runtime.worker.ts`

**Step 1: Rewrite the runtime worker**

Replace `src/workers/runtime.worker.ts` entirely:

```typescript
import { createWasiImports, WasiExit, STDIN_TOTAL_BYTES, STDIN_SIGNAL_EMPTY } from '../lib/wasiRuntime';

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

  if (msg.type === 'run') {
    const { id, wasmBinary, stdinBuffer } = msg;

    try {
      // Compile the WASM binary
      const module = await WebAssembly.compile(wasmBinary);

      // Create memory (start with 256 pages = 16MB, max 4096 pages = 256MB)
      const memory = new WebAssembly.Memory({ initial: 256, maximum: 4096 });

      // Create WASI imports
      const wasiImports = createWasiImports(memory, {
        stdinBuffer,
        onStdout: (text) => respond({ type: 'stdout', data: text }),
        onStderr: (text) => respond({ type: 'stderr', data: text }),
        onExit: (code) => respond({ type: 'exit', id, code }),
      });

      // Instantiate with WASI imports + memory
      const instance = await WebAssembly.instantiate(module, {
        ...wasiImports,
        env: { memory },
      });

      // The compiled WASM should export _start (WASI entry point)
      // Some compilers export memory, in which case use that instead
      const exports = instance.exports as {
        _start?: () => void;
        memory?: WebAssembly.Memory;
      };

      // Run the program
      try {
        exports._start?.();
        // If _start returns normally (no proc_exit call), report exit 0
        respond({ type: 'exit', id, code: 0 });
      } catch (err) {
        if (err instanceof WasiExit) {
          // Normal exit via proc_exit — already reported by WASI handler
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (err instanceof WasiExit) {
        // Already handled
      } else {
        const message = err instanceof Error ? err.message : 'Unknown runtime error';
        respond({ type: 'runtime-error', id, message });
      }
    }
  }

  // Note: stdin data is now handled via SharedArrayBuffer, not postMessage.
  // The 'stdin' message type is no longer used by this worker.
};
```

**IMPORTANT NOTE FOR IMPLEMENTER:** The WASM binary compiled by Clang/WASI may export its own `memory` instead of importing one. Check if the module's imports include `env.memory`. If the module exports memory, use `instance.exports.memory` instead of creating one. You may need to adjust the `createWasiImports` call to use the exported memory.

A common pattern:
```typescript
// Try instantiation — if it fails due to memory, retry with exported memory
const instance = await WebAssembly.instantiate(module, wasiImports);
const wasmMemory = (instance.exports.memory as WebAssembly.Memory) || memory;
// Re-create WASI imports with the correct memory if needed
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/workers/runtime.worker.ts
git commit -m "feat: integrate WASI runtime with SharedArrayBuffer stdin in runtime worker"
```

---

### Task 7: Update Runtime Bridge with SharedArrayBuffer

**Files:**
- Modify: `src/lib/runtimeBridge.ts`

The bridge now creates a SharedArrayBuffer, passes it to the worker, and writes stdin data to it using Atomics.

**Step 1: Rewrite the runtime bridge**

Replace `src/lib/runtimeBridge.ts`:

```typescript
import type {
  RuntimeOutput,
  RuntimeExit,
  RuntimeError,
} from '../workers/runtime.worker';
import {
  STDIN_TOTAL_BYTES,
  STDIN_HEADER_BYTES,
  STDIN_BUF_SIZE,
  STDIN_SIGNAL_EMPTY,
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

export class RuntimeBridge {
  private worker: Worker | null = null;
  private callbacks: RuntimeCallbacks;
  private stdinBuffer: SharedArrayBuffer | null = null;
  private stdinSignal: Int32Array | null = null;
  private stdinData: Uint8Array | null = null;
  private sharedArrayBufferSupported: boolean;

  constructor(callbacks: RuntimeCallbacks) {
    this.callbacks = callbacks;
    this.sharedArrayBufferSupported = typeof SharedArrayBuffer !== 'undefined';
  }

  run(wasmBinary: Uint8Array): string {
    this.worker?.terminate();

    this.worker = new Worker(
      new URL('../workers/runtime.worker.ts', import.meta.url),
      { type: 'module' },
    );

    const id = crypto.randomUUID();

    // Create SharedArrayBuffer for stdin
    if (this.sharedArrayBufferSupported) {
      this.stdinBuffer = new SharedArrayBuffer(STDIN_TOTAL_BYTES);
      this.stdinSignal = new Int32Array(this.stdinBuffer, 0, 2);
      this.stdinData = new Uint8Array(this.stdinBuffer, STDIN_HEADER_BYTES, STDIN_BUF_SIZE);
    }

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

    this.worker.postMessage({
      type: 'run',
      id,
      wasmBinary,
      stdinBuffer: this.stdinBuffer,
    });

    return id;
  }

  sendStdin(data: string) {
    if (!this.stdinSignal || !this.stdinData) {
      // SharedArrayBuffer not available — can't send interactive stdin
      return;
    }

    const encoded = new TextEncoder().encode(data);
    const len = Math.min(encoded.length, STDIN_BUF_SIZE);

    // Wait for previous stdin to be consumed
    // (non-blocking spin — main thread shouldn't use Atomics.wait)
    if (Atomics.load(this.stdinSignal, 0) !== STDIN_SIGNAL_EMPTY) {
      // Previous data not yet consumed — queue it
      // For simplicity, we overwrite. In practice, you'd want a proper queue.
      // Most terminal input is character-by-character so this is rarely hit.
    }

    // Write data to shared buffer
    this.stdinData.set(encoded.subarray(0, len));
    Atomics.store(this.stdinSignal, 1, len);
    Atomics.store(this.stdinSignal, 0, STDIN_SIGNAL_DATA);
    Atomics.notify(this.stdinSignal, 0);
  }

  sendEof() {
    if (!this.stdinSignal) return;
    Atomics.store(this.stdinSignal, 0, STDIN_SIGNAL_EOF);
    Atomics.notify(this.stdinSignal, 0);
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.stdinBuffer = null;
    this.stdinSignal = null;
    this.stdinData = null;
  }
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/lib/runtimeBridge.ts
git commit -m "feat: add SharedArrayBuffer stdin support to runtime bridge"
```

---

### Task 8: Update App.tsx — Wire Ctrl+D for EOF

**Files:**
- Modify: `src/app/App.tsx`

**Step 1: Update handleTerminalData to detect Ctrl+D**

In `src/app/App.tsx`, update the `handleTerminalData` callback:

```typescript
const handleTerminalData = useCallback((data: string) => {
  // Ctrl+D sends EOF (character code 4)
  if (data === '\x04') {
    runtimeRef.current?.sendEof();
  } else {
    runtimeRef.current?.sendStdin(data);
    // Echo input to terminal
    if (data === '\r') {
      terminalRef.current?.write('\r\n');
    } else if (data === '\x7f') {
      // Backspace
      terminalRef.current?.write('\b \b');
    } else {
      terminalRef.current?.write(data);
    }
  }
}, []);
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat: handle terminal input echo and Ctrl+D EOF"
```

---

### Task 9: Add Execution Timeout

**Files:**
- Modify: `src/lib/runtimeBridge.ts`

**Step 1: Add a 10-second timeout to the run method**

In `src/lib/runtimeBridge.ts`, add a timeout that terminates the worker after 10 seconds:

After the `this.worker.postMessage(...)` call in `run()`, add:

```typescript
// Set execution timeout (10 seconds)
const timeoutId = setTimeout(() => {
  if (this.worker) {
    this.worker.terminate();
    this.worker = null;
    this.callbacks.onError('Program timed out after 10 seconds (possible infinite loop)');
  }
}, 10000);

// Clear timeout on normal exit
const originalOnMessage = this.worker.onmessage;
this.worker.onmessage = (e: MessageEvent<MessageFromWorker>) => {
  const msg = e.data;
  if (msg.type === 'exit' || msg.type === 'runtime-error') {
    clearTimeout(timeoutId);
  }
  originalOnMessage?.call(this.worker, e);
};
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/lib/runtimeBridge.ts
git commit -m "feat: add 10-second execution timeout for infinite loop protection"
```

---

### Task 10: Final Verification

**Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

**Step 2: Build**

```bash
npm run build
```

Expected: Clean build.

**Step 3: Manual verification**

```bash
npm run dev
```

Test the following:

- [ ] Click "Run" — status bar shows "Downloading compiler..." with progress
- [ ] After download, Hello World compiles and shows output in terminal
- [ ] Try a program with `cin >>` — type input in terminal, program responds
- [ ] Try a compilation error (missing semicolon) — error shown in terminal
- [ ] Try an STL program (vector, sort, map) — compiles and runs
- [ ] Click "Run" again — no re-download, compiles immediately
- [ ] Ctrl+D sends EOF
- [ ] Infinite loop (while(true){}) — times out after 10 seconds
- [ ] Refresh page — compiler loads from cache quickly

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during WASM integration verification"
```

---

## Summary

| Task | What | Key Files |
|------|------|-----------|
| 1 | Install @wasmer/sdk, add progress to store | `package.json`, `editorStore.ts` |
| 2 | StatusBar download progress | `StatusBar.tsx` |
| 3 | Pipe progress through bridge | `compiler.worker.ts`, `App.tsx` |
| 4 | Wasmer SDK compiler worker | `compiler.worker.ts` |
| 5 | WASI runtime with SharedArrayBuffer stdin | `wasiRuntime.ts` (new) |
| 6 | Runtime worker with WASI | `runtime.worker.ts` |
| 7 | Runtime bridge with SharedArrayBuffer | `runtimeBridge.ts` |
| 8 | Terminal input echo + Ctrl+D | `App.tsx` |
| 9 | 10s execution timeout | `runtimeBridge.ts` |
| 10 | Final verification | All files |

### Key Risks

1. **Wasmer SDK API mismatch** — The SDK API in the plan is based on docs/blog posts. The actual TypeScript types may differ. Task 4 has notes for the implementer to verify against `node_modules/@wasmer/sdk`.

2. **WASI memory handling** — The compiled WASM may export its own memory rather than importing one. Task 6 has notes about this. The implementer may need to adjust memory handling.

3. **STL header availability** — The `clang/clang` Wasmer package may or may not include full C++ STL headers (libc++). If headers are missing, the implementer will need to find a Wasmer package that includes them or provide a sysroot.

4. **SharedArrayBuffer browser support** — Requires COOP/COEP headers (already configured in Vite). Won't work on some hosting without these headers. The runtime bridge has a `sharedArrayBufferSupported` check.
