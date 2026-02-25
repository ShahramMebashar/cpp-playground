import { create } from 'zustand';

const DEFAULT_CODE = `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}
`;

type WasmModule = 'clangd' | 'compiler';
type WasmLoadStatus = 'idle' | 'loading' | 'ready' | 'error';
type CompileStatus = 'idle' | 'compiling' | 'success' | 'error';

interface EditorState {
  code: string;
  initialCode: string;
  isDirty: boolean;
  compileStatus: CompileStatus;
  compileErrors: string[];
  wasmStatus: Record<WasmModule, WasmLoadStatus>;

  setCode: (code: string) => void;
  setCompileStatus: (status: CompileStatus) => void;
  setCompileErrors: (errors: string[]) => void;
  setWasmStatus: (module: WasmModule, status: WasmLoadStatus) => void;
  wasmProgress: number;
  setWasmProgress: (progress: number) => void;
  resetCode: (code: string) => void;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  code: DEFAULT_CODE,
  initialCode: DEFAULT_CODE,
  isDirty: false,
  compileStatus: 'idle',
  compileErrors: [],
  wasmStatus: {
    clangd: 'idle',
    compiler: 'idle',
  },

  setCode: (code) => set({ code, isDirty: code !== get().initialCode }),
  setCompileStatus: (compileStatus) => set({ compileStatus }),
  setCompileErrors: (compileErrors) => set({ compileErrors }),
  setWasmStatus: (module, status) =>
    set((state) => ({
      wasmStatus: { ...state.wasmStatus, [module]: status },
    })),
  wasmProgress: 0,
  setWasmProgress: (wasmProgress) => set({ wasmProgress }),
  resetCode: (code) => set({ code, initialCode: code, isDirty: false }),
}));
