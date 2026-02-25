export interface RunRequest {
  type: 'run';
  id: string;
  wasmBinary: Uint8Array;
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

let stdinBuffer: string[] = [];
let stdinResolve: ((data: string) => void) | null = null;

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  const msg = e.data;

  if (msg.type === 'stdin') {
    if (stdinResolve) {
      stdinResolve(msg.data);
      stdinResolve = null;
    } else {
      stdinBuffer.push(msg.data);
    }
  }

  if (msg.type === 'run') {
    try {
      // TODO: Replace with actual WASM instantiation
      respond({ type: 'stdout', data: 'Runtime not yet integrated.\r\n' });
      respond({ type: 'exit', id: msg.id, code: 0 });
    } catch (err) {
      respond({
        type: 'runtime-error',
        id: msg.id,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }
};
