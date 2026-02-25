export interface TaskCompileRequest {
  type: 'task-compile';
  id: string;
  code: string;
}

export interface TaskCompileResult {
  type: 'task-result';
  id: string;
  success: boolean;
  wasmBinary?: Uint8Array;
  stderr?: string;
  stdout?: string;
  errors?: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

export interface TaskStatus {
  type: 'task-status';
  id: string;
  message: string;
  progress?: number;
  detail?: string;
}

type TaskMessage = TaskCompileRequest;
type TaskResponse = TaskCompileResult | TaskStatus;

type WclangOptions = {
  readBuffer: (filename: string) => Promise<ArrayBuffer>;
  compileStreaming: (filename: string) => Promise<WebAssembly.Module>;
  hostWrite: (text: string) => void;
  clang?: string;
  lld?: string;
  memfs?: string;
  sysroot?: string;
  showTiming?: boolean;
};

type WclangApi = {
  ready: Promise<unknown>;
  clangFilename: string;
  clangCommonArgs: string[];
  compile: (options: {
    input: string;
    contents: string;
    obj: string;
    opt?: string;
  }) => Promise<unknown>;
  memfs: {
    addFile: (path: string, contents: string | Uint8Array) => void;
    getFileContents: (path: string) => Uint8Array;
  };
  getModule: (name: string) => Promise<WebAssembly.Module>;
  run: (module: WebAssembly.Module, ...args: string[]) => Promise<unknown>;
  link: (obj: string, wasm: string) => Promise<unknown>;
};

type WclangCtor = new (options: WclangOptions) => WclangApi;

const TOOLCHAIN_BASE_URL = 'https://binji.github.io/wasm-clang/';

let apiCtorPromise: Promise<WclangCtor> | null = null;
let wclangApi: WclangApi | null = null;
let ioBuffer = '';
let activeId = '';

// Track download progress for the toolchain
const assetSizes: Record<string, number> = {
  'shared.js': 50_000,
  'clang': 5_000_000,
  'lld': 3_000_000,
  'memfs': 200_000,
  'sysroot.tar': 7_000_000,
};
const totalEstimate = Object.values(assetSizes).reduce((a, b) => a + b, 0);
let downloadedBytes = 0;
let assetIndex = 0;
const totalAssets = Object.keys(assetSizes).length;

function post(msg: TaskResponse) {
  self.postMessage(msg);
}

function postProgress(message: string, detail?: string) {
  const progress = Math.min(0.95, downloadedBytes / totalEstimate);
  post({ type: 'task-status', id: activeId, message, progress, detail });
}

/** Fetch with progress tracking */
async function fetchWithProgress(url: string, label: string): Promise<Response> {
  assetIndex++;
  postProgress(`Downloading toolchain (${assetIndex}/${totalAssets})...`, label);

  const response = await fetch(url);
  const reader = response.body?.getReader();

  if (!reader) {
    const buf = await response.arrayBuffer();
    downloadedBytes += buf.byteLength;
    postProgress(`Downloading toolchain (${assetIndex}/${totalAssets})...`, label);
    return new Response(buf, { headers: response.headers });
  }

  const chunks: Uint8Array[] = [];
  let received = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    downloadedBytes += value.byteLength;
    postProgress(`Downloading toolchain (${assetIndex}/${totalAssets})...`, `${label} — ${(received / 1024 / 1024).toFixed(1)} MB`);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Response(merged.buffer, { headers: response.headers });
}

function toolchainUrl(filename: string): string {
  return `${TOOLCHAIN_BASE_URL}${filename}`;
}

async function loadApiCtor(): Promise<WclangCtor> {
  if (!apiCtorPromise) {
    apiCtorPromise = (async () => {
      const source = await fetch(toolchainUrl('shared.js')).then((r) => r.text());
      const factory = new Function(`${source}\n; return API;`);
      return factory() as WclangCtor;
    })();
  }

  return apiCtorPromise;
}

function parseErrors(stderr: string): NonNullable<TaskCompileResult['errors']> {
  const errors: NonNullable<TaskCompileResult['errors']> = [];
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

async function ensureApi(id: string) {
  if (wclangApi) return;

  activeId = id;
  downloadedBytes = 0;
  assetIndex = 0;
  post({ type: 'task-status', id, message: 'Preparing compiler...', progress: 0, detail: 'Loading toolchain API' });
  const ApiCtor = await loadApiCtor();

  wclangApi = new ApiCtor({
    async readBuffer(filename: string) {
      const response = await fetchWithProgress(toolchainUrl(filename), filename);
      return response.arrayBuffer();
    },
    async compileStreaming(filename: string) {
      const response = await fetchWithProgress(toolchainUrl(filename), filename);
      if (typeof WebAssembly.compileStreaming === 'function' && response.headers.get('content-type')?.includes('wasm')) {
        return WebAssembly.compileStreaming(response);
      }
      const buf = await response.arrayBuffer();
      return WebAssembly.compile(buf);
    },
    hostWrite(text: string) {
      ioBuffer += text;
    },
    clang: 'clang',
    lld: 'lld',
    memfs: 'memfs',
    sysroot: 'sysroot.tar',
    showTiming: false,
  });

  post({ type: 'task-status', id, message: 'Initializing compiler...', progress: 0.95, detail: 'Almost ready' });
  await wclangApi.ready;
  post({ type: 'task-status', id, message: 'Compiler ready', progress: 1 });
}

async function compile(id: string, code: string) {
  await ensureApi(id);

  if (!wclangApi) {
    post({
      type: 'task-result',
      id,
      success: false,
      stderr: 'Compiler API failed to initialize',
      errors: [{ line: 1, column: 1, severity: 'error', message: 'Compiler API failed to initialize' }],
    });
    return;
  }

  try {
    ioBuffer = '';
    const input = 'test.cc';
    const obj = 'test.o';
    const wasm = 'test.wasm';

    post({ type: 'task-status', id, message: 'Compiling C++ to WASM...' });
    await wclangApi.compile({
      input,
      contents: code,
      obj,
      opt: '0',
    });

    const compileErrors = parseErrors(ioBuffer);
    if (compileErrors.some((e) => e.severity === 'error')) {
      post({
        type: 'task-result',
        id,
        success: false,
        errors: compileErrors,
        stderr: ioBuffer || 'Compilation failed',
      });
      return;
    }

    ioBuffer = '';
    post({ type: 'task-status', id, message: 'Linking...' });

    await wclangApi.link(obj, wasm);

    const linkErrors = parseErrors(ioBuffer);
    if (linkErrors.some((e) => e.severity === 'error')) {
      post({
        type: 'task-result',
        id,
        success: false,
        errors: linkErrors,
        stderr: ioBuffer || 'Linking failed',
      });
      return;
    }

    const wasmBinary = wclangApi.memfs.getFileContents(wasm);
    if (wasmBinary.byteLength < 8) {
      post({
        type: 'task-result',
        id,
        success: false,
        stderr: ioBuffer || 'Linking produced an empty/invalid WASM output',
        errors: [{
          line: 1,
          column: 1,
          severity: 'error',
          message: 'Linking produced an empty/invalid WASM output',
        }],
      });
      return;
    }

    const hasMagic =
      wasmBinary[0] === 0x00
      && wasmBinary[1] === 0x61
      && wasmBinary[2] === 0x73
      && wasmBinary[3] === 0x6d;

    if (!hasMagic) {
      post({
        type: 'task-result',
        id,
        success: false,
        stderr: ioBuffer || 'Output is not a valid WebAssembly binary',
        errors: [{
          line: 1,
          column: 1,
          severity: 'error',
          message: 'Output is not a valid WebAssembly binary',
        }],
      });
      return;
    }

    const wasmForValidation = new Uint8Array(wasmBinary);
    await WebAssembly.compile(wasmForValidation);

    post({
      type: 'task-result',
      id,
      success: true,
      stdout: ioBuffer,
      wasmBinary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({
      type: 'task-result',
      id,
      success: false,
      stderr: message,
      errors: [{ line: 1, column: 1, severity: 'error', message }],
    });
  }
}

self.onmessage = async (event: MessageEvent<TaskMessage>) => {
  const msg = event.data;
  if (msg.type === 'task-compile') {
    await compile(msg.id, msg.code);
  }
};
