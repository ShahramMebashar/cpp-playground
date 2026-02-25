// ---------------------------------------------------------------------------
// WASI snapshot_preview1 runtime for in-browser WASM execution
// ---------------------------------------------------------------------------

// WASI errno constants
const ESUCCESS = 0;
const EBADF = 8;
const ENOSYS = 52;

// Standard file descriptors
const FD_STDIN = 0;
const FD_STDOUT = 1;
const FD_STDERR = 2;

// SharedArrayBuffer layout for stdin
// [0..3]  Int32  signal flag  (EMPTY=0 | DATA=1 | EOF=2)
// [4..7]  Int32  data length in bytes
// [8..]   Uint8  payload (up to STDIN_BUF_SIZE bytes)
export const STDIN_BUF_SIZE = 4096;
export const STDIN_HEADER_BYTES = 8;
export const STDIN_TOTAL_BYTES = STDIN_HEADER_BYTES + STDIN_BUF_SIZE;

export const STDIN_SIGNAL_EMPTY = 0;
export const STDIN_SIGNAL_DATA = 1;
export const STDIN_SIGNAL_EOF = 2;

// ---------------------------------------------------------------------------
// WasiExit — thrown by proc_exit to halt WASM execution
// ---------------------------------------------------------------------------
export class WasiExit extends Error {
  code: number;
  constructor(code: number) {
    super(`WASI proc_exit(${code})`);
    this.name = "WasiExit";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Options accepted by createWasiImports
// ---------------------------------------------------------------------------
interface WasiOptions {
  stdinBuffer: SharedArrayBuffer;
  onStdout: (text: string) => void;
  onStderr: (text: string) => void;
  onExit: (code: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read an array of (buf_ptr, buf_len) iov structs from WASM linear memory. */
function readIovs(
  view: DataView,
  iovsPtr: number,
  iovsLen: number,
): { ptr: number; len: number }[] {
  const result: { ptr: number; len: number }[] = [];
  for (let i = 0; i < iovsLen; i++) {
    const base = iovsPtr + i * 8;
    const ptr = view.getUint32(base, true);
    const len = view.getUint32(base + 4, true);
    result.push({ ptr, len });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createWasiImports(
  memory: WebAssembly.Memory,
  options: WasiOptions,
): { wasi_snapshot_preview1: Record<string, (...args: number[]) => number | void> } {
  const { stdinBuffer, onStdout, onStderr, onExit } = options;
  const decoder = new TextDecoder();

  // Typed views over the shared stdin buffer
  const stdinSignal = new Int32Array(stdinBuffer, 0, 1);
  const stdinLength = new Int32Array(stdinBuffer, 4, 1);
  const stdinData = new Uint8Array(stdinBuffer, STDIN_HEADER_BYTES, STDIN_BUF_SIZE);

  // Helpers that always reference the *current* memory buffer (it can grow).
  const mem8 = () => new Uint8Array(memory.buffer);
  const memView = () => new DataView(memory.buffer);

  // --- WASI functions -------------------------------------------------------

  function fd_write(
    fd: number,
    iovsPtr: number,
    iovsLen: number,
    nwrittenPtr: number,
  ): number {
    if (fd !== FD_STDOUT && fd !== FD_STDERR) return EBADF;

    const view = memView();
    const iovs = readIovs(view, iovsPtr, iovsLen);
    let totalWritten = 0;

    for (const iov of iovs) {
      const bytes = mem8().subarray(iov.ptr, iov.ptr + iov.len);
      const text = decoder.decode(bytes, { stream: true });
      if (fd === FD_STDOUT) {
        onStdout(text);
      } else {
        onStderr(text);
      }
      totalWritten += iov.len;
    }

    view.setUint32(nwrittenPtr, totalWritten, true);
    return ESUCCESS;
  }

  function fd_read(
    fd: number,
    iovsPtr: number,
    iovsLen: number,
    nreadPtr: number,
  ): number {
    if (fd !== FD_STDIN) return EBADF;

    // Block until the host signals data or EOF
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const signal = Atomics.load(stdinSignal, 0);

      if (signal === STDIN_SIGNAL_EOF) {
        // EOF — return 0 bytes read
        memView().setUint32(nreadPtr, 0, true);
        return ESUCCESS;
      }

      if (signal === STDIN_SIGNAL_DATA) {
        break;
      }

      // EMPTY — wait for host to store data
      Atomics.wait(stdinSignal, 0, STDIN_SIGNAL_EMPTY);
    }

    const dataLen = Atomics.load(stdinLength, 0);

    const view = memView();
    const iovs = readIovs(view, iovsPtr, iovsLen);

    let bytesRead = 0;
    let srcOffset = 0;

    for (const iov of iovs) {
      if (srcOffset >= dataLen) break;
      const toCopy = Math.min(iov.len, dataLen - srcOffset);
      mem8().set(stdinData.subarray(srcOffset, srcOffset + toCopy), iov.ptr);
      srcOffset += toCopy;
      bytesRead += toCopy;
    }

    // Mark buffer as consumed
    Atomics.store(stdinSignal, 0, STDIN_SIGNAL_EMPTY);
    Atomics.notify(stdinSignal, 0);

    view.setUint32(nreadPtr, bytesRead, true);
    return ESUCCESS;
  }

  function proc_exit(code: number): void {
    onExit(code);
    throw new WasiExit(code);
  }

  function args_sizes_get(argcPtr: number, argvBufSizePtr: number): number {
    const view = memView();
    view.setUint32(argcPtr, 0, true);
    view.setUint32(argvBufSizePtr, 0, true);
    return ESUCCESS;
  }

  function args_get(_argvPtr: number, _argvBufPtr: number): number {
    return ESUCCESS;
  }

  function environ_sizes_get(countPtr: number, bufSizePtr: number): number {
    const view = memView();
    view.setUint32(countPtr, 0, true);
    view.setUint32(bufSizePtr, 0, true);
    return ESUCCESS;
  }

  function environ_get(_environPtr: number, _environBufPtr: number): number {
    return ESUCCESS;
  }

  function clock_time_get(
    _clockId: number,
    _precision: number,
    timePtr: number,
  ): number {
    const now = BigInt(Date.now()) * 1_000_000n; // ms → ns
    const view = memView();
    view.setBigUint64(timePtr, now, true);
    return ESUCCESS;
  }

  function fd_close(_fd: number): number {
    return ESUCCESS;
  }

  function fd_fdstat_get(fd: number, bufPtr: number): number {
    // Minimal fdstat: filetype + flags
    const view = memView();
    // filetype: CHARACTER_DEVICE (2) for stdio
    if (fd <= FD_STDERR) {
      view.setUint8(bufPtr, 2);
    } else {
      return EBADF;
    }
    // fdflags (u16) at offset 2
    view.setUint16(bufPtr + 2, 0, true);
    // rights_base (u64) at offset 8
    view.setBigUint64(bufPtr + 8, 0n, true);
    // rights_inheriting (u64) at offset 16
    view.setBigUint64(bufPtr + 16, 0n, true);
    return ESUCCESS;
  }

  function fd_prestat_get(_fd: number): number {
    return EBADF;
  }

  function fd_prestat_dir_name(_fd: number, _pathPtr: number, _pathLen: number): number {
    return EBADF;
  }

  function random_get(bufPtr: number, bufLen: number): number {
    const buf = mem8().subarray(bufPtr, bufPtr + bufLen);
    crypto.getRandomValues(buf);
    return ESUCCESS;
  }

  // Stub returning ENOSYS for unimplemented calls
  const stub = (): number => ENOSYS;

  return {
    wasi_snapshot_preview1: {
      fd_write,
      fd_read,
      proc_exit,
      args_sizes_get,
      args_get,
      environ_sizes_get,
      environ_get,
      clock_time_get,
      fd_close,
      fd_fdstat_get,
      fd_prestat_get,
      fd_prestat_dir_name,
      random_get,

      // Stubs for remaining WASI functions
      fd_seek: stub,
      fd_tell: stub,
      fd_sync: stub,
      fd_datasync: stub,
      fd_advise: stub,
      fd_allocate: stub,
      fd_filestat_get: stub,
      fd_filestat_set_size: stub,
      fd_filestat_set_times: stub,
      fd_pread: stub,
      fd_pwrite: stub,
      fd_readdir: stub,
      fd_renumber: stub,
      path_create_directory: stub,
      path_filestat_get: stub,
      path_filestat_set_times: stub,
      path_link: stub,
      path_open: stub,
      path_readlink: stub,
      path_remove_directory: stub,
      path_rename: stub,
      path_symlink: stub,
      path_unlink_file: stub,
      poll_oneoff: stub,
      sched_yield: stub,
      sock_accept: stub,
      sock_recv: stub,
      sock_send: stub,
      sock_shutdown: stub,
    },
  };
}
