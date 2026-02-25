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
  compilerMessage: string;
  toolchainLoading: boolean;
  toolchainProgress: number;
  toolchainDetail: string;

  setCode: (code: string) => void;
  setCompileStatus: (status: CompileStatus) => void;
  setCompileErrors: (errors: string[]) => void;
  setWasmStatus: (module: WasmModule, status: WasmLoadStatus) => void;
  setCompilerMessage: (message: string) => void;
  wasmProgress: number;
  setWasmProgress: (progress: number) => void;
  setToolchainLoading: (loading: boolean) => void;
  setToolchainProgress: (progress: number, detail?: string) => void;
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
  compilerMessage: '',
  toolchainLoading: false,
  toolchainProgress: 0,
  toolchainDetail: '',

  setCode: (code) => set({ code, isDirty: code !== get().initialCode }),
  setCompileStatus: (compileStatus) => set({ compileStatus }),
  setCompileErrors: (compileErrors) => set({ compileErrors }),
  setWasmStatus: (module, status) =>
    set((state) => ({
      wasmStatus: { ...state.wasmStatus, [module]: status },
    })),
  setCompilerMessage: (compilerMessage) => set({ compilerMessage }),
  wasmProgress: 0,
  setWasmProgress: (wasmProgress) => set({ wasmProgress }),
  setToolchainLoading: (toolchainLoading) => set({ toolchainLoading }),
  setToolchainProgress: (progress, detail) => set({ toolchainProgress: progress, toolchainDetail: detail ?? '' }),
  resetCode: (code) => set({ code, initialCode: code, isDirty: false }),
}));
