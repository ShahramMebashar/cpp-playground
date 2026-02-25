import { useEditorStore } from '../../app/store/editorStore';

export function StatusBar() {
  const compileStatus = useEditorStore((s) => s.compileStatus);
  const wasmStatus = useEditorStore((s) => s.wasmStatus);

  const statusParts: string[] = [];

  if (wasmStatus.compiler === 'loading') {
    statusParts.push('Loading compiler...');
  } else if (wasmStatus.compiler === 'error') {
    statusParts.push('Compiler failed to load');
  }

  if (wasmStatus.clangd === 'loading') {
    statusParts.push('Loading clangd...');
  } else if (wasmStatus.clangd === 'error') {
    statusParts.push('Clangd unavailable');
  }

  if (compileStatus === 'compiling') {
    statusParts.push('Compiling...');
  }

  const statusText = statusParts.length > 0 ? statusParts.join(' | ') : 'Ready';

  return (
    <footer className="status-bar">
      <span>{statusText}</span>
    </footer>
  );
}
