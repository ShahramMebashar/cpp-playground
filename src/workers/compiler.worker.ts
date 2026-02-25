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

// Lazily initialized compiler state
let clangPkg: Awaited<ReturnType<typeof loadCompiler>> | null = null;
let initPromise: Promise<void> | null = null;

async function loadCompiler() {
  const { init, Wasmer } = await import('@wasmer/sdk');
  await init();
  const pkg = await Wasmer.fromRegistry('clang/clang');
  return pkg;
}

async function initCompiler() {
  respond({ type: 'status', status: 'loading', message: 'Initializing Wasmer SDK...', progress: 0 });

  try {
    respond({ type: 'status', status: 'loading', message: 'Loading Wasmer SDK...', progress: 0.1 });
    const { init, Wasmer } = await import('@wasmer/sdk');

    respond({ type: 'status', status: 'loading', message: 'Initializing WASM runtime...', progress: 0.3 });
    await init();

    respond({ type: 'status', status: 'loading', message: 'Fetching clang/clang from registry...', progress: 0.5 });
    clangPkg = await Wasmer.fromRegistry('clang/clang');

    respond({ type: 'status', status: 'ready', message: 'Compiler ready', progress: 1.0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    respond({ type: 'status', status: 'error', message: `Failed to initialize compiler: ${message}` });
    throw err;
  }
}

function parseClangErrors(stderr: string): NonNullable<CompileResponse['errors']> {
  const errors: NonNullable<CompileResponse['errors']> = [];
  const regex = /^[^:]+:(\d+):(\d+):\s+(error|warning):\s+(.+)$/;

  for (const line of stderr.split('\n')) {
    const match = line.match(regex);
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

async function compile(id: string, code: string) {
  try {
    const { Directory } = await import('@wasmer/sdk');

    const srcDir = new Directory();
    await srcDir.writeFile('main.cpp', new TextEncoder().encode(code));

    const outDir = new Directory();

    const instance = await clangPkg!.entrypoint!.run({
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
      mount: { '/src': srcDir, '/out': outDir },
    });

    const output = await instance.wait();
    const errors = parseClangErrors(output.stderr);

    if (output.ok) {
      const wasmBinary = await outDir.readFile('program.wasm');
      respond({
        type: 'compile-result',
        id,
        success: true,
        wasmBinary,
        errors,
        stdout: output.stdout,
        stderr: output.stderr,
      });
    } else {
      respond({
        type: 'compile-result',
        id,
        success: false,
        errors: errors.length > 0 ? errors : [{ line: 1, column: 1, severity: 'error', message: output.stderr || 'Compilation failed' }],
        stdout: output.stdout,
        stderr: output.stderr,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    respond({
      type: 'compile-result',
      id,
      success: false,
      errors: [{ line: 1, column: 1, severity: 'error', message }],
      stderr: message,
    });
  }
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === 'compile') {
    // Lazy init: ensure compiler is loaded before first compile
    if (!clangPkg) {
      if (!initPromise) {
        initPromise = initCompiler();
      }
      try {
        await initPromise;
      } catch {
        respond({
          type: 'compile-result',
          id: msg.id,
          success: false,
          errors: [{ line: 1, column: 1, severity: 'error', message: 'Compiler failed to initialize' }],
          stderr: 'Compiler failed to initialize',
        });
        return;
      }
    }

    await compile(msg.id, msg.code);
  }
};

// Eagerly start loading the compiler
initPromise = initCompiler();
