import Split from 'react-split';
import './App.css';

export function App() {
  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <span className="logo">C++ Playground</span>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-run" disabled>
            Run
          </button>
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
          <div className="placeholder">Editor</div>
        </div>
        <div className="terminal-pane">
          <div className="placeholder">Terminal</div>
        </div>
      </Split>

      <footer className="status-bar">
        <span>Ready</span>
      </footer>
    </div>
  );
}
