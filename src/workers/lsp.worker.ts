export interface LspRequest {
  type: 'initialize' | 'didChange' | 'completion' | 'hover' | 'definition';
  id?: string;
  params?: unknown;
}

export interface LspResponse {
  type: 'initialized' | 'diagnostics' | 'completion-result' | 'hover-result' | 'definition-result' | 'status';
  id?: string;
  data?: unknown;
}

function respond(msg: LspResponse) {
  self.postMessage(msg);
}

async function initClangd() {
  respond({ type: 'status', data: { status: 'loading' } });
  // TODO: Load clangd WASM binary
  respond({ type: 'status', data: { status: 'ready' } });
}

self.onmessage = (e: MessageEvent<LspRequest>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'didChange':
      break;
    case 'completion':
      respond({ type: 'completion-result', id: msg.id, data: { items: [] } });
      break;
    case 'hover':
      respond({ type: 'hover-result', id: msg.id, data: null });
      break;
    case 'definition':
      respond({ type: 'definition-result', id: msg.id, data: null });
      break;
  }
};

initClangd();
