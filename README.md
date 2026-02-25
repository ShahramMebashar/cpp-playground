# C++ Playground

A browser-based C++ compiler and runtime. Write, compile, and run C++ code entirely in the browser — no server required.

## Features

- **In-browser compilation** — Uses [wasm-clang](https://github.com/nicedoc/nicedoc.io/issues/69) (Clang/LLD compiled to WebAssembly) to compile C++ directly in the browser
- **Interactive I/O** — Full `stdin`/`stdout`/`stderr` support (`cin`, `cout`, `cerr` all work)
- **Monaco Editor** — VS Code-quality code editing with syntax highlighting and autocomplete
- **xterm.js Terminal** — Real terminal emulator for program output and input
- **Code sharing** — Share code via URL (compressed, base64-encoded hash)
- **Templates** — Quick-start templates for common C++ patterns
- **Responsive layout** — Side-by-side on desktop, stacked on mobile
- **Offline-capable** — Service worker caches assets for offline use

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19, Zustand |
| Editor | Monaco Editor |
| Terminal | xterm.js |
| Compiler | wasm-clang (Clang + LLD → WebAssembly) |
| Runtime | Custom WASI implementation |
| Build | Vite, TypeScript |
| Testing | Vitest |

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────┐
│   React UI  │────▶│ Compiler Worker   │────▶│ Runtime Worker  │
│  (Monaco +  │     │  (supervisor)     │     │  (WASI runtime) │
│   xterm.js) │     │   ┌────────────┐  │     │                │
│             │◀────│   │ Task Worker │  │     │  stdin via     │
│             │     │   │ (wasm-clang)│  │     │  SharedArray   │
│             │◀────│   └────────────┘  │     │  Buffer        │
└─────────────┘     └──────────────────┘     └────────────────┘
```

- **Compiler Worker** — Supervisor that spawns a killable child task worker with a 25s timeout
- **Compiler Task Worker** — Loads wasm-clang API, runs Clang compile + LLD link, produces WASM binary
- **Runtime Worker** — Executes compiled WASM with a custom WASI implementation supporting interactive `stdin` via `SharedArrayBuffer` + `Atomics`

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm

### Install & Run

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Lint with ESLint |

## Project Structure

```
src/
├── app/
│   ├── App.tsx              # Main app component
│   ├── App.css              # Global styles
│   ├── main.tsx             # Entry point
│   └── store/
│       └── editorStore.ts   # Zustand state management
├── components/
│   ├── Editor/              # Monaco code editor + toolbar
│   ├── Terminal/             # xterm.js terminal
│   ├── Templates/           # Template picker menu
│   ├── Share/               # Share button (URL encoding)
│   └── StatusBar/           # Bottom status bar
├── lib/
│   ├── compilerBridge.ts    # UI ↔ compiler worker bridge
│   ├── runtimeBridge.ts     # UI ↔ runtime worker bridge
│   ├── wasiRuntime.ts       # Custom WASI syscall implementation
│   ├── shareCodec.ts        # URL sharing encoder/decoder
│   └── templates.ts         # Code templates
└── workers/
    ├── compiler.worker.ts       # Supervisor worker
    ├── compilerTask.worker.ts   # wasm-clang compile/link worker
    └── runtime.worker.ts        # WASM execution worker
```

## License

MIT
