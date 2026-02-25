import { useRef, useEffect, useCallback, useState } from 'react';
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

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const code = useEditorStore((s) => s.code);
  const setCompileStatus = useEditorStore((s) => s.setCompileStatus);
  const setWasmStatus = useEditorStore((s) => s.setWasmStatus);
  const setCompilerMessage = useEditorStore((s) => s.setCompilerMessage);

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
    const setWasmProgress = useEditorStore.getState().setWasmProgress;
    compilerRef.current = new CompilerBridge((status) => {
      setWasmStatus('compiler', status.status === 'ready' ? 'ready' : status.status === 'loading' ? 'loading' : 'error');
      setCompilerMessage(status.message ?? '');
      if (status.progress !== undefined) {
        setWasmProgress(status.progress);
      }
      if (status.status === 'error' && status.message) {
        terminalRef.current?.writeln(`\x1b[31m${status.message}\x1b[0m`);
      }
    });

    const warm = () => compilerRef.current?.warmup();
    let timerId: ReturnType<typeof setTimeout> | null = null;

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => warm());
    } else {
      timerId = setTimeout(warm, 1200);
    }

    return () => {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      compilerRef.current?.terminate();
    };
  }, [setCompilerMessage, setWasmStatus]);

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
      return;
    }

    if (result.stdout) {
      terminalRef.current?.write(result.stdout);
    }
    terminalRef.current?.writeln('');
    terminalRef.current?.writeln('\x1b[90m--- Program exited with code 0 ---\x1b[0m');
    setCompileStatus('idle');
  }, [code, setCompileStatus]);

  const handleTerminalData = useCallback((data: string) => {
    if (data === '\x04') {
      runtimeRef.current?.sendEof();
    } else {
      runtimeRef.current?.sendStdin(data);
      if (data === '\r') {
        terminalRef.current?.write('\r\n');
      } else if (data === '\x7f') {
        terminalRef.current?.write('\b \b');
      } else {
        terminalRef.current?.write(data);
      }
    }
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
        className={`split-container${isMobile ? ' split-vertical' : ''}`}
        sizes={isMobile ? [60, 40] : [55, 45]}
        minSize={isMobile ? 100 : 200}
        gutterSize={6}
        direction={isMobile ? 'vertical' : 'horizontal'}
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
