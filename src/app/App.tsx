import { useRef, useEffect, useCallback } from 'react';
import Split from 'react-split';
import { CodeEditor } from '../components/Editor/CodeEditor';
import { EditorToolbar } from '../components/Editor/EditorToolbar';
import { Terminal } from '../components/Terminal/Terminal';
import type { TerminalHandle } from '../components/Terminal/Terminal';
import { TemplateMenu } from '../components/Templates/TemplateMenu';
import { ShareButton } from '../components/Share/ShareButton';
import { StatusBar } from '../components/StatusBar/StatusBar';
import { CompilerBridge } from '../lib/compilerBridge';
import { RuntimeBridge } from '../lib/runtimeBridge';
import { decodeCode } from '../lib/shareCodec';
import { useEditorStore } from './store/editorStore';
import './App.css';

export function App() {
  const terminalRef = useRef<TerminalHandle>(null);
  const compilerRef = useRef<CompilerBridge | null>(null);
  const runtimeRef = useRef<RuntimeBridge | null>(null);

  const code = useEditorStore((s) => s.code);
  const setCompileStatus = useEditorStore((s) => s.setCompileStatus);
  const setWasmStatus = useEditorStore((s) => s.setWasmStatus);

  // Load code from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const decoded = decodeCode(hash);
      if (decoded) {
        useEditorStore.getState().resetCode(decoded);
      }
    }
  }, []);

  // Initialize compiler bridge
  useEffect(() => {
    compilerRef.current = new CompilerBridge((status) => {
      setWasmStatus('compiler', status.status === 'ready' ? 'ready' : status.status === 'loading' ? 'loading' : 'error');
    });
    return () => compilerRef.current?.terminate();
  }, [setWasmStatus]);

  // Initialize runtime bridge
  useEffect(() => {
    runtimeRef.current = new RuntimeBridge({
      onStdout: (data) => terminalRef.current?.write(data),
      onStderr: (data) => terminalRef.current?.write(`\x1b[31m${data}\x1b[0m`),
      onExit: (exitCode) => {
        terminalRef.current?.writeln('');
        terminalRef.current?.writeln(`\x1b[90m--- Program exited with code ${exitCode} ---\x1b[0m`);
        setCompileStatus('idle');
      },
      onError: (message) => {
        terminalRef.current?.writeln(`\x1b[31mRuntime error: ${message}\x1b[0m`);
        setCompileStatus('error');
      },
    });
    return () => runtimeRef.current?.terminate();
  }, [setCompileStatus]);

  const handleRun = useCallback(async () => {
    if (!compilerRef.current) return;

    terminalRef.current?.clear();
    terminalRef.current?.writeln('\x1b[90m--- Compiling... ---\x1b[0m');
    setCompileStatus('compiling');

    const result = await compilerRef.current.compile(code);

    if (!result.success) {
      setCompileStatus('error');
      if (result.stderr) {
        terminalRef.current?.writeln(`\x1b[31m${result.stderr}\x1b[0m`);
      }
      result.errors?.forEach((err) => {
        terminalRef.current?.writeln(
          `\x1b[31mLine ${err.line}:${err.column}: ${err.message}\x1b[0m`,
        );
      });
      return;
    }

    if (result.wasmBinary) {
      terminalRef.current?.writeln('\x1b[90m--- Running... ---\x1b[0m');
      terminalRef.current?.writeln('');
      runtimeRef.current?.run(result.wasmBinary);
    }
  }, [code, setCompileStatus]);

  const handleTerminalData = useCallback((data: string) => {
    runtimeRef.current?.sendStdin(data);
  }, []);

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <span className="logo">C++ Playground</span>
        </div>
        <div className="toolbar-right">
          <TemplateMenu />
          <EditorToolbar onRun={handleRun} />
          <ShareButton />
        </div>
      </header>

      <Split
        className="split-container"
        sizes={[55, 45]}
        minSize={200}
        gutterSize={6}
        direction="horizontal"
      >
        <div className="editor-pane">
          <CodeEditor />
        </div>
        <div className="terminal-pane">
          <Terminal ref={terminalRef} onData={handleTerminalData} />
        </div>
      </Split>

      <StatusBar />
    </div>
  );
}
