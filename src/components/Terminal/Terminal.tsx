import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalHandle {
  write: (text: string) => void;
  writeln: (text: string) => void;
  clear: () => void;
}

interface TerminalProps {
  onData?: (data: string) => void;
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(
  function Terminal({ onData }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<XTerm | null>(null);

    useImperativeHandle(ref, () => ({
      write: (text) => termRef.current?.write(text),
      writeln: (text) => termRef.current?.writeln(text),
      clear: () => termRef.current?.clear(),
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const term = new XTerm({
        theme: {
          background: '#1e1e1e',
          foreground: '#cccccc',
          cursor: '#cccccc',
          selectionBackground: '#264f78',
        },
        fontSize: 14,
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
        cursorBlink: true,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      term.writeln('C++ Playground — Ready');
      term.writeln('');

      term.onData((data) => onData?.(data));

      termRef.current = term;

      const observer = new ResizeObserver(() => fitAddon.fit());
      observer.observe(containerRef.current);

      return () => {
        observer.disconnect();
        term.dispose();
      };
    }, [onData]);

    return (
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', padding: '4px' }}
      />
    );
  },
);
