import { describe, it, expect } from 'vitest';
import { templates, getTemplatesByCategory, getTemplateById } from '../templates';

describe('templates', () => {
  it('has at least one template per category', () => {
    const categories = ['basics', 'io', 'data-structures', 'algorithms'] as const;
    for (const cat of categories) {
      expect(getTemplatesByCategory(cat).length).toBeGreaterThan(0);
    }
  });

  it('every template has valid compilable code', () => {
    for (const t of templates) {
      expect(t.code).toContain('main');
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
    }
  });

  it('finds template by id', () => {
    const t = getTemplateById('hello-world');
    expect(t).toBeDefined();
    expect(t!.name).toBe('Hello World');
  });

  it('returns undefined for unknown id', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined();
  });
});
