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
}

type WorkerMessage = CompileRequest;
type WorkerResponse = CompileResponse | StatusMessage;

function respond(msg: WorkerResponse) {
  self.postMessage(msg);
}

async function initCompiler() {
  respond({ type: 'status', status: 'loading', message: 'Loading compiler...' });
  // TODO: Load actual Clang WASM binary
  respond({ type: 'status', status: 'ready' });
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === 'compile') {
    respond({
      type: 'compile-result',
      id: msg.id,
      success: false,
      errors: [],
      stderr: 'Compiler WASM not yet loaded. Integration pending.',
    });
  }
};

initCompiler();
