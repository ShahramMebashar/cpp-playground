import Editor from '@monaco-editor/react';
import { useEditorStore } from '../../app/store/editorStore';

export function CodeEditor() {
  const code = useEditorStore((s) => s.code);
  const setCode = useEditorStore((s) => s.setCode);

  return (
    <Editor
      height="100%"
      defaultLanguage="cpp"
      theme="vs-dark"
      value={code}
      onChange={(value) => setCode(value ?? '')}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        wordWrap: 'off',
        lineNumbers: 'on',
        renderLineHighlight: 'line',
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        padding: { top: 8 },
      }}
    />
  );
}
