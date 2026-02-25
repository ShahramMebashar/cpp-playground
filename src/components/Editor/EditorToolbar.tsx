import { useEditorStore } from '../../app/store/editorStore';

interface EditorToolbarProps {
  onRun: () => void;
}

export function EditorToolbar({ onRun }: EditorToolbarProps) {
  const compileStatus = useEditorStore((s) => s.compileStatus);
  const compilerReady = useEditorStore((s) => s.wasmStatus.compiler);
  const isCompiling = compileStatus === 'compiling';

  return (
    <>
      <button
        className="btn btn-run"
        onClick={onRun}
        disabled={isCompiling || compilerReady === 'loading'}
      >
        {isCompiling ? 'Compiling...' : '▶ Run'}
      </button>
    </>
  );
}
