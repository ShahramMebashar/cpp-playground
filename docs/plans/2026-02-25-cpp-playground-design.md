# C++ Playground — Design Document

## Overview

An online C++ code editor with full IDE features, in-browser compilation, and interactive terminal I/O. Zero server dependencies — everything runs client-side via WebAssembly.

## Audience

- **Students** learning C++
- **Competitive programmers** solving algorithmic problems

## Decisions

| Decision | Choice |
|---|---|
| Compilation | Fully in-browser via WASM (Emscripten) |
| LSP | Full clangd compiled to WASM |
| Terminal | Interactive xterm.js |
| Tech stack | React + TypeScript |
| State management | Zustand |
| Code sharing | URL hash with pako compression |
| Deployment | Static hosting (GitHub Pages / Netlify / Vercel) |
| Toolchain | Emscripten |

## Architecture

Single-thread main UI with 3 Web Workers for heavy lifting.

```
┌─────────────────────────────────────────────────────┐
│                    Main Thread                       │
│  ┌───────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Monaco Editor │  │ xterm.js │  │  React App   │  │
│  │ (+ LSP client)│  │ Terminal │  │  (UI shell)  │  │
│  └──────┬────────┘  └────┬─────┘  └──────────────┘  │
│         │                │                           │
└─────────┼────────────────┼───────────────────────────┘
          │ postMessage    │ postMessage
          │                │
┌─────────▼──────┐  ┌─────▼────────┐  ┌──────────────┐
│  Worker 1:     │  │  Worker 3:   │  │  Worker 2:   │
│  Clangd LSP    │  │  Program     │  │  Compiler    │
│  (WASM)        │  │  Runtime     │  │  (Clang WASM)│
│                │  │  (WASM)      │  │              │
│  - autocomplete│  │  - stdin via │  │  - C++ → WASM│
│  - diagnostics │  │    xterm.js  │  │  - outputs   │
│  - go-to-def   │  │  - stdout →  │  │    .wasm bin │
│                │  │    terminal  │  │              │
│  Virtual FS    │  │  Emscripten  │  │  Virtual FS  │
│  (Emscripten)  │  │  Runtime     │  │  (Emscripten)│
└────────────────┘  └──────────────┘  └──────────────┘
```

### Data Flow

1. User types code in Monaco editor
2. Monaco sends file changes to Worker 1 (clangd) for real-time diagnostics/autocomplete
3. User clicks "Run" — code sent to Worker 2 (compiler) — produces WASM binary
4. WASM binary sent to Worker 3 (runtime) — executes with stdin/stdout piped to xterm.js

### Lazy Loading

- Monaco + React: loaded immediately (~2MB)
- Clangd WASM: loaded after editor mounts (~30-50MB, cached via Service Worker)
- Compiler WASM: loaded on first "Run" click (~30-40MB, cached)
- Runtime: lightweight, loaded with compiler output

## Component Structure

```
src/
├── app/
│   ├── App.tsx                 # Root layout — editor + terminal split
│   ├── main.tsx                # Entry point
│   └── store/
│       └── editorStore.ts      # Zustand — editor state, compile status
│
├── components/
│   ├── Editor/
│   │   ├── CodeEditor.tsx      # Monaco wrapper, LSP client integration
│   │   └── EditorToolbar.tsx   # Run button, template selector, share button
│   ├── Terminal/
│   │   └── Terminal.tsx        # xterm.js wrapper, stdin/stdout handling
│   ├── Templates/
│   │   └── TemplateMenu.tsx    # Dropdown with pre-built C++ examples
│   └── Share/
│       └── ShareButton.tsx     # Encode/decode code to URL hash
│
├── workers/
│   ├── lsp.worker.ts           # Clangd WASM
│   ├── compiler.worker.ts      # Clang WASM compiler
│   └── runtime.worker.ts       # Runs compiled WASM, bridges stdin/stdout
│
├── lib/
│   ├── lspClient.ts            # Monaco <-> LSP worker message protocol
│   ├── compilerBridge.ts       # Main thread <-> compiler worker protocol
│   ├── runtimeBridge.ts        # Terminal <-> runtime worker protocol
│   ├── shareCodec.ts           # Compress/decompress code for URL hash
│   └── templates.ts            # Template definitions
│
└── assets/
    └── wasm/                   # WASM binaries (or fetched from CDN)
```

## LSP Integration

- Uses `monaco-languageclient` adapted for Web Workers
- Messages follow LSP JSON-RPC spec, serialized over `postMessage`
- Clangd's virtual filesystem synced with editor content on every change
- Supports: autocomplete, diagnostics, go-to-definition

## Compile & Run Flow

1. User clicks "Run"
2. Code sent to compiler worker via `compilerBridge.ts`
3. Clang WASM compiles C++ to WASM binary
4. On error: map compiler errors to Monaco diagnostics + show in terminal
5. On success: send WASM binary to runtime worker
6. Runtime worker instantiates binary, bridges stdin/stdout to xterm.js
7. On program exit: show exit code in terminal

## Code Sharing

1. Get code string from editor
2. Compress with pako (deflate) — ~60-70% compression
3. Base64 encode
4. Set `window.location.hash`

On page load: reverse the process. Invalid/corrupted hash ignored silently.

Typical 100-line C++ program compresses to ~500 bytes, within the ~2KB URL safe limit.

## Templates

```typescript
type Template = {
  id: string;
  name: string;
  category: 'basics' | 'data-structures' | 'algorithms' | 'io';
  code: string;
  description: string;
};
```

| Category | Templates |
|---|---|
| Basics | Hello World, Variables & Types, Control Flow, Functions |
| I/O | cin/cout, String input, Reading until EOF |
| Data Structures | Vector, Map, Set, Stack/Queue, Pair/Tuple |
| Algorithms | Sorting, Binary Search, BFS/DFS, DP starter |

Bundled in JS, no extra fetches. Selecting a template replaces editor content (with confirmation if unsaved changes).

## Error Handling

### WASM Loading
- Progress bar for each WASM module
- Clangd fails → editor works without autocomplete, dismissible banner
- Compiler fails → "Run" button disabled with tooltip
- Retry button for failed loads

### Compilation
- Errors/warnings mapped to Monaco diagnostics (line numbers, severity)
- Shown as squiggly underlines AND in terminal output

### Runtime
- Infinite loop: configurable timeout (default 10s), worker terminated and restarted
- Memory limit: ~256MB via Emscripten flags
- Crash (segfault, etc.): caught in worker, error displayed in terminal

### Sharing
- Code too large → message: "Code too large to share via URL"
- Corrupted hash → ignored, empty editor

## UI Layout

```
┌──────────────────────────────────────────────────────────┐
│  [Logo] C++ Playground    [Templates ▼] [▶ Run] [Share]  │
├──────────────────────────────────────────────────────────┤
│                          │                               │
│     Monaco Editor        │       xterm.js Terminal       │
│                          │                               │
│                          ◄─── draggable splitter ───►    │
│                          │                               │
└──────────────────────────────────────────────────────────┘
│  Loading clangd... ████░░ 65%                            │
└──────────────────────────────────────────────────────────┘
```

- Horizontal split: editor left, terminal right (resizable)
- Mobile: vertical stack (editor top, terminal bottom)
- Dark theme by default (`vs-dark`)
- Status bar: WASM loading progress, compiler status, cursor position
- Terminal clears on each run with timestamp separator

## Browser Support

- Requires: WebAssembly, Web Workers, modern ES modules
- Target: Chrome 90+, Firefox 90+, Safari 15+, Edge 90+
- Unsupported browser → fallback message

## MVP Scope

**In v1:**
1. Monaco editor with syntax highlighting + themes
2. Clangd LSP via WASM (autocomplete, diagnostics, go-to-definition)
3. C++ compilation via WASM (Emscripten/Clang)
4. Interactive terminal (xterm.js) with stdin/stdout
5. Code sharing via URL hash
6. Pre-built code templates for students

**Not in v1:**
- Multiple file support / tabs
- Settings panel (font size, theme, compiler flags)
- User accounts / saved snippets
- Collaborative editing
