import { useState } from 'react';
import { useEditorStore } from '../../app/store/editorStore';
import { encodeCode, isCodeTooLarge } from '../../lib/shareCodec';

export function ShareButton() {
  const code = useEditorStore((s) => s.code);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (isCodeTooLarge(code)) {
      alert('Code is too large to share via URL. Copy the code manually.');
      return;
    }

    const encoded = encodeCode(code);
    const url = `${window.location.origin}${window.location.pathname}#${encoded}`;
    window.location.hash = encoded;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: just update the URL
    }
  };

  return (
    <button className="btn" onClick={handleShare}>
      {copied ? 'Copied!' : 'Share'}
    </button>
  );
}
