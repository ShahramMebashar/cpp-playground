import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';

describe('editorStore', () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState());
  });

  it('has default code', () => {
    const state = useEditorStore.getState();
    expect(state.code).toContain('#include');
  });

  it('updates code', () => {
    useEditorStore.getState().setCode('int main() {}');
    expect(useEditorStore.getState().code).toBe('int main() {}');
  });

  it('tracks compile status', () => {
    const { setCompileStatus } = useEditorStore.getState();
    setCompileStatus('compiling');
    expect(useEditorStore.getState().compileStatus).toBe('compiling');
  });

  it('tracks WASM loading state', () => {
    const { setWasmStatus } = useEditorStore.getState();
    setWasmStatus('compiler', 'loading');
    expect(useEditorStore.getState().wasmStatus.compiler).toBe('loading');
    setWasmStatus('compiler', 'ready');
    expect(useEditorStore.getState().wasmStatus.compiler).toBe('ready');
  });

  it('marks dirty when code changes from initial', () => {
    const initial = useEditorStore.getState().code;
    useEditorStore.getState().setCode('changed');
    expect(useEditorStore.getState().isDirty).toBe(true);
    useEditorStore.getState().setCode(initial);
    expect(useEditorStore.getState().isDirty).toBe(false);
  });
});
