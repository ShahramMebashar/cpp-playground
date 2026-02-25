import { useEditorStore } from '../../app/store/editorStore';
import './LoadingModal.css';

export function LoadingModal() {
  const loading = useEditorStore((s) => s.toolchainLoading);
  const progress = useEditorStore((s) => s.toolchainProgress);
  const detail = useEditorStore((s) => s.toolchainDetail);
  const message = useEditorStore((s) => s.compilerMessage);

  if (!loading) return null;

  const percent = Math.round(progress * 100);

  return (
    <div className="loading-overlay">
      <div className="loading-modal">
        <div className="loading-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="var(--border)" strokeWidth="3" />
            <circle
              cx="24" cy="24" r="20"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeDasharray={`${percent * 1.257} 125.7`}
              strokeLinecap="round"
              transform="rotate(-90 24 24)"
              className="loading-progress-ring"
            />
          </svg>
          <span className="loading-percent">{percent}%</span>
        </div>

        <h2 className="loading-title">
          {progress >= 0.95 ? 'Almost ready...' : 'Setting up compiler'}
        </h2>

        <p className="loading-message">{message}</p>

        {detail && <p className="loading-detail">{detail}</p>}

        <div className="loading-bar-track">
          <div
            className="loading-bar-fill"
            style={{ width: `${percent}%` }}
          />
        </div>

        <p className="loading-hint">
          First run downloads ~15 MB of compiler tools.<br />
          Subsequent runs will be faster.
        </p>
      </div>
    </div>
  );
}
