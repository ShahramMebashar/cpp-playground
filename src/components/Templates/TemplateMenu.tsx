import { useState, useRef, useEffect } from 'react';
import { templates } from '../../lib/templates';
import type { TemplateCategory } from '../../lib/templates';
import { useEditorStore } from '../../app/store/editorStore';
import './TemplateMenu.css';

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  basics: 'Basics',
  io: 'I/O',
  'data-structures': 'Data Structures',
  algorithms: 'Algorithms',
};

const CATEGORY_ORDER: TemplateCategory[] = [
  'basics',
  'io',
  'data-structures',
  'algorithms',
];

export function TemplateMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isDirty = useEditorStore((s) => s.isDirty);
  const resetCode = useEditorStore((s) => s.resetCode);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (code: string) => {
    if (isDirty && !confirm('Replace current code with template?')) return;
    resetCode(code);
    setIsOpen(false);
  };

  return (
    <div className="template-menu" ref={menuRef}>
      <button className="btn" onClick={() => setIsOpen(!isOpen)}>
        Templates ▾
      </button>
      {isOpen && (
        <div className="template-dropdown">
          {CATEGORY_ORDER.map((category) => (
            <div key={category} className="template-category">
              <div className="template-category-label">
                {CATEGORY_LABELS[category]}
              </div>
              {templates
                .filter((t) => t.category === category)
                .map((t) => (
                  <button
                    key={t.id}
                    className="template-item"
                    onClick={() => handleSelect(t.code)}
                    title={t.description}
                  >
                    {t.name}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
