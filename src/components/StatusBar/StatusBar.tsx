import { useEditorStore } from '../../app/store/editorStore';

export function StatusBar() {
  const compileStatus = useEditorStore((s) => s.compileStatus);
  const wasmStatus = useEditorStore((s) => s.wasmStatus);
  const wasmProgress = useEditorStore((s) => s.wasmProgress);
  const compilerMessage = useEditorStore((s) => s.compilerMessage);

  const statusParts: string[] = [];

  if (wasmStatus.compiler === 'loading') {
    const pct = Math.round(wasmProgress * 100);
    statusParts.push(compilerMessage || `Downloading compiler... ${pct}%`);
  } else if (wasmStatus.compiler === 'error') {
    statusParts.push('Compiler failed to load');
  } else if (compilerMessage && compileStatus !== 'compiling') {
    statusParts.push(compilerMessage);
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
