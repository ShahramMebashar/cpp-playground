export interface CompileRequest {
  type: 'compile';
  id: string;
  code: string;
}

export interface WarmupRequest {
  type: 'warmup';
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

type WorkerMessage = CompileRequest | WarmupRequest;
type WorkerResponse = CompileResponse | StatusMessage;

type TaskStatus = {
  type: 'task-status';
  id: string;
  message: string;
};

type TaskResult = {
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
};

type TaskResponse = TaskStatus | TaskResult;

const TASK_TIMEOUT_MS = 25_000;

function respond(msg: WorkerResponse) {
  self.postMessage(msg);
}

let taskWorker: Worker | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;
let activeCompileId: string | null = null;

function ensureTaskWorker() {
  if (taskWorker) return;

  taskWorker = new Worker(new URL('./compilerTask.worker.ts', import.meta.url), {
    type: 'module',
  });

  taskWorker.onmessage = (event: MessageEvent<TaskResponse>) => {
    const msg = event.data;

    if (msg.type === 'task-status') {
      respond({
        type: 'status',
        status: 'ready',
        message: msg.message,
        progress: 1,
      });
      return;
    }

    if (msg.type === 'task-result') {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      activeCompileId = null;

      respond({
        type: 'compile-result',
        id: msg.id,
        success: msg.success,
        wasmBinary: msg.wasmBinary,
        stdout: msg.stdout,
        stderr: msg.stderr,
        errors: msg.errors,
      });

      respond({
        type: 'status',
        status: msg.success ? 'ready' : 'error',
        message: msg.success ? 'Compilation complete' : msg.stderr || 'Compilation failed',
        progress: 1,
      });
    }
  };

  taskWorker.onerror = (event) => {
    const compileId = activeCompileId;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    taskWorker?.terminate();
    taskWorker = null;
    activeCompileId = null;

    if (compileId) {
      respond({
        type: 'compile-result',
        id: compileId,
        success: false,
        stderr: `Compiler worker crashed: ${event.message || 'unknown error'}`,
        errors: [{
          line: 1,
          column: 1,
          severity: 'error',
          message: `Compiler worker crashed: ${event.message || 'unknown error'}`,
        }],
      });
    }

    respond({
      type: 'status',
      status: 'error',
      message: 'Compiler worker crashed and was reset',
    });
  };
}

function runCompile(id: string, code: string) {
  ensureTaskWorker();

  if (!taskWorker) {
    respond({
      type: 'compile-result',
      id,
      success: false,
      stderr: 'Compiler task worker unavailable',
      errors: [{ line: 1, column: 1, severity: 'error', message: 'Compiler task worker unavailable' }],
    });
    return;
  }

  if (activeCompileId) {
    respond({
      type: 'compile-result',
      id,
      success: false,
      stderr: 'Another compilation is already in progress',
      errors: [{ line: 1, column: 1, severity: 'error', message: 'Another compilation is already in progress' }],
    });
    return;
  }

  activeCompileId = id;
  respond({
    type: 'status',
    status: 'loading',
    message: 'Starting compiler task...',
    progress: 0.6,
  });

  taskWorker.postMessage({ type: 'task-compile', id, code });

  timeoutId = setTimeout(() => {
    const timedOutId = activeCompileId;
    taskWorker?.terminate();
    taskWorker = null;
    activeCompileId = null;
    timeoutId = null;

    if (timedOutId) {
      respond({
        type: 'compile-result',
        id: timedOutId,
        success: false,
        stderr: `Compilation exceeded ${TASK_TIMEOUT_MS / 1000}s and was aborted`,
        errors: [{
          line: 1,
          column: 1,
          severity: 'error',
          message: `Compilation exceeded ${TASK_TIMEOUT_MS / 1000}s and was aborted`,
        }],
      });
    }

    respond({
      type: 'status',
      status: 'error',
      message: 'Compiler task timed out and was reset',
    });
  }, TASK_TIMEOUT_MS);
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  if (msg.type === 'warmup') {
    ensureTaskWorker();
    respond({
      type: 'status',
      status: 'ready',
      message: 'Compiler warmup ready',
      progress: 1,
    });
    return;
  }

  if (msg.type === 'compile') {
    runCompile(msg.id, msg.code);
  }
};
