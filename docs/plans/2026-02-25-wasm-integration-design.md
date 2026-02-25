# WASM Integration Design — Wasmer SDK

## Overview

Integrate real C++ compilation and execution into the C++ Playground using `@wasmer/sdk` to run Clang in-browser via WebAssembly. Interactive stdin/stdout via SharedArrayBuffer + Atomics.

## Decisions

| Decision | Choice |
|---|---|
| Compiler | @wasmer/sdk + clang/clang package |
| Download size | ~25-35MB compressed (cached permanently) |
| C++ support | C++17, STL (vector, map, set, algorithm, etc.) |
| stdin | Interactive via SharedArrayBuffer + Atomics.wait |
| stdout/stderr | postMessage (non-blocking) |
| Caching | Service Worker + Wasmer IndexedDB cache |
| LSP | Stays stubbed (out of scope) |

## Architecture

```
User clicks "Run"
     │
     ▼
compiler.worker.ts
  1. First run: init() + Wasmer.fromRegistry("clang/clang") [~25-35MB, cached]
  2. Write user code to virtual filesystem → /src/main.cpp
  3. Run: clang++ /src/main.cpp -o /out/program.wasm --target=wasm32-wasi -O2 -std=c++17
  4. Read /out/program.wasm → send to main thread
     │
     ▼
runtime.worker.ts
  1. Receive compiled .wasm binary
  2. Instantiate with WASI imports (fd_read, fd_write, proc_exit)
  3. Run _start()
     - stdin: Atomics.wait() on SharedArrayBuffer ← xterm.js
     - stdout: postMessage → xterm.js
     - stderr: postMessage → xterm.js (red)
```

## Interactive stdin via SharedArrayBuffer

```
Main Thread (xterm.js)              Runtime Worker (WASM)
    │                                      │
    │                                      │ cin >> x → fd_read
    │                                      │ → Atomics.wait(sharedBuf) BLOCKS
    │                                      │
    │  user types "42\n"                   │
    ├─ write to SharedArrayBuffer ────────►│
    │  Atomics.notify()                    │
    │                                      │ → WAKES, reads "42\n"
    │                                      │ → program continues
    │                                      │
    │                                      │ cout << result → fd_write
    │  ◄─── postMessage ──────────────────┤
    │  display in xterm.js                 │
```

SharedArrayBuffer layout:
- Offset 0: [Int32] signal flag (0=empty, 1=data ready)
- Offset 4: [Int32] data length
- Offset 8+: [Uint8] stdin data (max 4KB)

Requirements: COOP/COEP headers (already configured in Vite).

Fallback: If SharedArrayBuffer unavailable, disable interactive stdin, use pre-filled input mode.

## Caching & Loading UX

- Page load: Monaco + React (~2MB)
- First "Run": download compiler with progress bar (~25-35MB)
- Subsequent runs: compiler in worker memory (instant)
- Page reload: Service Worker serves from cache (~1-2s)
- Wasmer SDK also caches in IndexedDB automatically

## File Changes

**Modified:**
- `src/workers/compiler.worker.ts` — Wasmer SDK integration
- `src/workers/runtime.worker.ts` — WASI runtime + SharedArrayBuffer stdin
- `src/lib/runtimeBridge.ts` — SharedArrayBuffer creation, stdin forwarding
- `src/components/StatusBar/StatusBar.tsx` — download progress percentage
- `src/app/store/editorStore.ts` — add wasmProgress field

**New:**
- `src/lib/wasiRuntime.ts` — WASI syscall implementations
- `src/workers/service-worker.ts` — caches Wasmer/Clang WASM binaries

**New dependency:** `@wasmer/sdk`

**Unchanged:** All React components, share codec, templates, CSS.

## Error Handling

- Download failure: retry button, no page reload needed
- Compilation errors: parse Clang stderr, map to Monaco diagnostics + terminal
- Segfault/memory out of bounds: WASM trap caught, displayed in terminal
- Infinite loop: 10s timeout, terminate + respawn worker
- Stack overflow: WASM trap, "Stack overflow" message
- Missing headers: Clang error is self-explanatory
- SharedArrayBuffer unavailable: fallback to pre-filled stdin mode
