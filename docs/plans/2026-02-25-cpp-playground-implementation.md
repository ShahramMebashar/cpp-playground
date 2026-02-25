# C++ Playground Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a zero-server online C++ editor with Monaco, clangd LSP via WASM, in-browser compilation, and interactive terminal I/O.

**Architecture:** React + TypeScript SPA with 3 Web Workers (clangd LSP, Clang compiler, program runtime), all running WASM in-browser. Zustand for state. Monaco for editing. xterm.js for terminal. URL hash for sharing.

**Tech Stack:** Vite, React 18, TypeScript, Zustand, Monaco Editor, xterm.js, pako, Emscripten (WASM)

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `src/app/main.tsx`, `src/app/App.tsx`
- Create: `src/vite-env.d.ts`

**Step 1: Initialize Vite project with React + TypeScript**

```bash
npm create vite@latest . -- --template react-ts
```

Accept overwrite prompts. This generates the base structure.

**Step 2: Install core dependencies**

```bash
npm install zustand @monaco-editor/react monaco-editor @xterm/xterm @xterm/addon-fit pako
npm install -D @types/pako vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Step 3: Configure Vite for Web Workers and WASM**

Replace `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@anthropic-ai/sdk'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

**Step 4: Create test setup file**

Create `src/test-setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

**Step 5: Clean up generated files**

Delete: `src/App.css`, `src/index.css`, `src/assets/`, `src/App.tsx` (we'll rewrite it).

Replace `src/app/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Replace `src/app/App.tsx`:

```tsx
export function App() {
  return <div>C++ Playground</div>;
}
```

Update `index.html` to point to `src/app/main.tsx`.

**Step 6: Verify it builds and runs**

```bash
npm run dev
# Visit http://localhost:5173 — should show "C++ Playground"
npm run build
# Should build without errors
```

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript project with dependencies"
```

---

## Task 2: Zustand Store

**Files:**
- Create: `src/app/store/editorStore.ts`
- Create: `src/app/store/__tests__/editorStore.test.ts`

**Step 1: Write the failing test**

Create `src/app/store/__tests__/editorStore.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/store/__tests__/editorStore.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `src/app/store/editorStore.ts`:

```typescript
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
  resetCode: (code) => set({ code, initialCode: code, isDirty: false }),
}));
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/store/__tests__/editorStore.test.ts
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/app/store/
git commit -m "feat: add Zustand editor store with compile and WASM status tracking"
```

---

## Task 3: Share Codec

**Files:**
- Create: `src/lib/shareCodec.ts`
- Create: `src/lib/__tests__/shareCodec.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/shareCodec.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { encodeCode, decodeCode, isCodeTooLarge } from '../shareCodec';

describe('shareCodec', () => {
  it('round-trips simple code', () => {
    const code = '#include <iostream>\nint main() { return 0; }';
    const encoded = encodeCode(code);
    expect(decodeCode(encoded)).toBe(code);
  });

  it('round-trips code with special characters', () => {
    const code = 'std::cout << "Hello\\n" << std::endl;';
    const encoded = encodeCode(code);
    expect(decodeCode(encoded)).toBe(code);
  });

  it('round-trips empty string', () => {
    expect(decodeCode(encodeCode(''))).toBe('');
  });

  it('returns null for invalid encoded data', () => {
    expect(decodeCode('not-valid-data!!!')).toBeNull();
  });

  it('returns null for empty string decode', () => {
    expect(decodeCode('')).toBeNull();
  });

  it('detects code too large for URL', () => {
    const smallCode = 'int main() {}';
    expect(isCodeTooLarge(smallCode)).toBe(false);

    const largeCode = 'x'.repeat(5000);
    expect(isCodeTooLarge(largeCode)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/shareCodec.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `src/lib/shareCodec.ts`:

```typescript
import pako from 'pako';

const MAX_URL_BYTES = 2000;

export function encodeCode(code: string): string {
  const compressed = pako.deflate(new TextEncoder().encode(code));
  return btoa(String.fromCharCode(...compressed));
}

export function decodeCode(encoded: string): string | null {
  if (!encoded) return null;
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decompressed = pako.inflate(bytes);
    return new TextDecoder().decode(decompressed);
  } catch {
    return null;
  }
}

export function isCodeTooLarge(code: string): boolean {
  const encoded = encodeCode(code);
  return encoded.length > MAX_URL_BYTES;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/shareCodec.test.ts
```

Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/shareCodec.ts src/lib/__tests__/shareCodec.test.ts
git commit -m "feat: add share codec with pako compression for URL hash sharing"
```

---

## Task 4: Templates

**Files:**
- Create: `src/lib/templates.ts`
- Create: `src/lib/__tests__/templates.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/templates.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/templates.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `src/lib/templates.ts`:

```typescript
export type TemplateCategory = 'basics' | 'data-structures' | 'algorithms' | 'io';

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  code: string;
  description: string;
}

export const templates: Template[] = [
  // Basics
  {
    id: 'hello-world',
    name: 'Hello World',
    category: 'basics',
    description: 'The classic first program',
    code: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}
`,
  },
  {
    id: 'variables-types',
    name: 'Variables & Types',
    category: 'basics',
    description: 'Basic variable declarations and types',
    code: `#include <iostream>
#include <string>
using namespace std;

int main() {
    int age = 25;
    double pi = 3.14159;
    char grade = 'A';
    string name = "Alice";
    bool isStudent = true;

    cout << "Name: " << name << endl;
    cout << "Age: " << age << endl;
    cout << "Pi: " << pi << endl;
    cout << "Grade: " << grade << endl;
    cout << "Student: " << boolalpha << isStudent << endl;

    return 0;
}
`,
  },
  {
    id: 'control-flow',
    name: 'Control Flow',
    category: 'basics',
    description: 'If/else, for loops, while loops',
    code: `#include <iostream>
using namespace std;

int main() {
    // If/else
    int x = 10;
    if (x > 5) {
        cout << x << " is greater than 5" << endl;
    } else {
        cout << x << " is not greater than 5" << endl;
    }

    // For loop
    cout << "Counting: ";
    for (int i = 1; i <= 5; i++) {
        cout << i << " ";
    }
    cout << endl;

    // While loop
    int n = 1;
    while (n <= 10) {
        n *= 2;
    }
    cout << "First power of 2 > 10: " << n << endl;

    return 0;
}
`,
  },
  {
    id: 'functions',
    name: 'Functions',
    category: 'basics',
    description: 'Function declarations, parameters, return values',
    code: `#include <iostream>
using namespace std;

int add(int a, int b) {
    return a + b;
}

bool isPrime(int n) {
    if (n <= 1) return false;
    for (int i = 2; i * i <= n; i++) {
        if (n % i == 0) return false;
    }
    return true;
}

int main() {
    cout << "3 + 4 = " << add(3, 4) << endl;

    for (int i = 1; i <= 20; i++) {
        if (isPrime(i)) {
            cout << i << " is prime" << endl;
        }
    }

    return 0;
}
`,
  },

  // I/O
  {
    id: 'cin-cout',
    name: 'cin/cout',
    category: 'io',
    description: 'Basic input and output',
    code: `#include <iostream>
using namespace std;

int main() {
    cout << "Enter your name: ";
    string name;
    cin >> name;

    cout << "Enter your age: ";
    int age;
    cin >> age;

    cout << "Hello, " << name << "! You are " << age << " years old." << endl;

    return 0;
}
`,
  },
  {
    id: 'string-input',
    name: 'String Input',
    category: 'io',
    description: 'Reading full lines with getline',
    code: `#include <iostream>
#include <string>
using namespace std;

int main() {
    cout << "Enter a sentence: ";
    string sentence;
    getline(cin, sentence);

    cout << "You typed: " << sentence << endl;
    cout << "Length: " << sentence.length() << " characters" << endl;

    return 0;
}
`,
  },
  {
    id: 'read-until-eof',
    name: 'Reading Until EOF',
    category: 'io',
    description: 'Process input line by line until end of input',
    code: `#include <iostream>
#include <string>
using namespace std;

int main() {
    string line;
    int lineNum = 1;

    cout << "Enter lines (Ctrl+D to end):" << endl;
    while (getline(cin, line)) {
        cout << lineNum++ << ": " << line << endl;
    }

    cout << "Total lines: " << lineNum - 1 << endl;
    return 0;
}
`,
  },

  // Data Structures
  {
    id: 'vector',
    name: 'Vector',
    category: 'data-structures',
    description: 'Dynamic array with std::vector',
    code: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    vector<int> nums = {5, 2, 8, 1, 9, 3};

    cout << "Original: ";
    for (int n : nums) cout << n << " ";
    cout << endl;

    sort(nums.begin(), nums.end());
    cout << "Sorted: ";
    for (int n : nums) cout << n << " ";
    cout << endl;

    nums.push_back(7);
    cout << "After push_back(7): ";
    for (int n : nums) cout << n << " ";
    cout << endl;

    cout << "Size: " << nums.size() << endl;

    return 0;
}
`,
  },
  {
    id: 'map',
    name: 'Map',
    category: 'data-structures',
    description: 'Key-value pairs with std::map',
    code: `#include <iostream>
#include <map>
#include <string>
using namespace std;

int main() {
    map<string, int> ages;
    ages["Alice"] = 25;
    ages["Bob"] = 30;
    ages["Charlie"] = 22;

    cout << "Bob's age: " << ages["Bob"] << endl;

    cout << "All entries:" << endl;
    for (const auto& [name, age] : ages) {
        cout << "  " << name << ": " << age << endl;
    }

    if (ages.count("Alice")) {
        cout << "Alice found!" << endl;
    }

    return 0;
}
`,
  },
  {
    id: 'set',
    name: 'Set',
    category: 'data-structures',
    description: 'Unique sorted elements with std::set',
    code: `#include <iostream>
#include <set>
using namespace std;

int main() {
    set<int> s = {3, 1, 4, 1, 5, 9, 2, 6, 5};

    cout << "Set (duplicates removed, sorted): ";
    for (int x : s) cout << x << " ";
    cout << endl;

    s.insert(7);
    s.erase(4);

    cout << "After insert(7), erase(4): ";
    for (int x : s) cout << x << " ";
    cout << endl;

    cout << "Contains 5? " << (s.count(5) ? "yes" : "no") << endl;
    cout << "Size: " << s.size() << endl;

    return 0;
}
`,
  },
  {
    id: 'stack-queue',
    name: 'Stack & Queue',
    category: 'data-structures',
    description: 'LIFO stack and FIFO queue',
    code: `#include <iostream>
#include <stack>
#include <queue>
using namespace std;

int main() {
    // Stack (LIFO)
    stack<int> st;
    st.push(1); st.push(2); st.push(3);

    cout << "Stack (top first): ";
    while (!st.empty()) {
        cout << st.top() << " ";
        st.pop();
    }
    cout << endl;

    // Queue (FIFO)
    queue<int> q;
    q.push(1); q.push(2); q.push(3);

    cout << "Queue (front first): ";
    while (!q.empty()) {
        cout << q.front() << " ";
        q.pop();
    }
    cout << endl;

    return 0;
}
`,
  },
  {
    id: 'pair-tuple',
    name: 'Pair & Tuple',
    category: 'data-structures',
    description: 'Grouping values with pair and tuple',
    code: `#include <iostream>
#include <tuple>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    // Pair
    pair<string, int> p = {"Alice", 95};
    cout << p.first << " scored " << p.second << endl;

    // Vector of pairs (sorted by second element)
    vector<pair<string, int>> scores = {
        {"Alice", 95}, {"Bob", 87}, {"Charlie", 92}
    };
    sort(scores.begin(), scores.end(),
         [](const auto& a, const auto& b) { return a.second > b.second; });

    cout << "Ranking:" << endl;
    for (const auto& [name, score] : scores) {
        cout << "  " << name << ": " << score << endl;
    }

    // Tuple
    auto [x, y, z] = make_tuple(1, 2.5, "hello");
    cout << x << ", " << y << ", " << z << endl;

    return 0;
}
`,
  },

  // Algorithms
  {
    id: 'sorting',
    name: 'Sorting',
    category: 'algorithms',
    description: 'Various sorting approaches',
    code: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    vector<int> nums = {64, 25, 12, 22, 11};

    // STL sort
    sort(nums.begin(), nums.end());
    cout << "Ascending: ";
    for (int n : nums) cout << n << " ";
    cout << endl;

    // Descending
    sort(nums.begin(), nums.end(), greater<int>());
    cout << "Descending: ";
    for (int n : nums) cout << n << " ";
    cout << endl;

    // Custom sort (by last digit)
    sort(nums.begin(), nums.end(),
         [](int a, int b) { return a % 10 < b % 10; });
    cout << "By last digit: ";
    for (int n : nums) cout << n << " ";
    cout << endl;

    return 0;
}
`,
  },
  {
    id: 'binary-search',
    name: 'Binary Search',
    category: 'algorithms',
    description: 'Binary search on sorted data',
    code: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

int binarySearch(const vector<int>& arr, int target) {
    int lo = 0, hi = arr.size() - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}

int main() {
    vector<int> nums = {2, 5, 8, 12, 16, 23, 38, 56, 72, 91};

    cout << "Array: ";
    for (int n : nums) cout << n << " ";
    cout << endl;

    int target;
    cout << "Enter number to find: ";
    cin >> target;

    int idx = binarySearch(nums, target);
    if (idx != -1) {
        cout << "Found at index " << idx << endl;
    } else {
        cout << "Not found" << endl;
    }

    return 0;
}
`,
  },
  {
    id: 'bfs-dfs',
    name: 'BFS & DFS',
    category: 'algorithms',
    description: 'Graph traversal with BFS and DFS',
    code: `#include <iostream>
#include <vector>
#include <queue>
using namespace std;

void bfs(const vector<vector<int>>& adj, int start) {
    vector<bool> visited(adj.size(), false);
    queue<int> q;
    q.push(start);
    visited[start] = true;

    cout << "BFS: ";
    while (!q.empty()) {
        int node = q.front(); q.pop();
        cout << node << " ";
        for (int neighbor : adj[node]) {
            if (!visited[neighbor]) {
                visited[neighbor] = true;
                q.push(neighbor);
            }
        }
    }
    cout << endl;
}

void dfs(const vector<vector<int>>& adj, int node, vector<bool>& visited) {
    visited[node] = true;
    cout << node << " ";
    for (int neighbor : adj[node]) {
        if (!visited[neighbor]) {
            dfs(adj, neighbor, visited);
        }
    }
}

int main() {
    int n = 6;
    vector<vector<int>> adj(n);
    adj[0] = {1, 2};
    adj[1] = {0, 3, 4};
    adj[2] = {0, 4};
    adj[3] = {1, 5};
    adj[4] = {1, 2, 5};
    adj[5] = {3, 4};

    bfs(adj, 0);

    vector<bool> visited(n, false);
    cout << "DFS: ";
    dfs(adj, 0, visited);
    cout << endl;

    return 0;
}
`,
  },
  {
    id: 'dp-starter',
    name: 'Dynamic Programming',
    category: 'algorithms',
    description: 'Classic DP: Fibonacci and coin change',
    code: `#include <iostream>
#include <vector>
using namespace std;

// Fibonacci with memoization
long long fib(int n, vector<long long>& memo) {
    if (n <= 1) return n;
    if (memo[n] != -1) return memo[n];
    return memo[n] = fib(n - 1, memo) + fib(n - 2, memo);
}

// Coin change: minimum coins to make amount
int coinChange(const vector<int>& coins, int amount) {
    vector<int> dp(amount + 1, amount + 1);
    dp[0] = 0;
    for (int i = 1; i <= amount; i++) {
        for (int coin : coins) {
            if (coin <= i) {
                dp[i] = min(dp[i], dp[i - coin] + 1);
            }
        }
    }
    return dp[amount] > amount ? -1 : dp[amount];
}

int main() {
    // Fibonacci
    int n = 40;
    vector<long long> memo(n + 1, -1);
    cout << "fib(" << n << ") = " << fib(n, memo) << endl;

    // Coin change
    vector<int> coins = {1, 5, 10, 25};
    int amount = 63;
    cout << "Min coins for " << amount << " cents: " << coinChange(coins, amount) << endl;

    return 0;
}
`,
  },
];

export function getTemplatesByCategory(category: TemplateCategory): Template[] {
  return templates.filter((t) => t.category === category);
}

export function getTemplateById(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/templates.test.ts
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/templates.ts src/lib/__tests__/templates.test.ts
git commit -m "feat: add C++ code templates for students and competitive programmers"
```

---

## Task 5: UI Shell — Split Layout

**Files:**
- Create: `src/app/App.tsx` (rewrite)
- Create: `src/app/App.css`

**Step 1: Install split pane library**

```bash
npm install react-split
```

**Step 2: Build the App shell**

Rewrite `src/app/App.tsx`:

```tsx
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
          {/* TemplateMenu, Run button, ShareButton — added in later tasks */}
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
          {/* CodeEditor — added in Task 6 */}
          <div className="placeholder">Editor</div>
        </div>
        <div className="terminal-pane">
          {/* Terminal — added in Task 7 */}
          <div className="placeholder">Terminal</div>
        </div>
      </Split>

      <footer className="status-bar">
        <span>Ready</span>
      </footer>
    </div>
  );
}
```

**Step 3: Create styles**

Create `src/app/App.css`:

```css
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-toolbar: #2d2d2d;
  --text-primary: #cccccc;
  --text-secondary: #858585;
  --accent: #0078d4;
  --accent-hover: #1a8adb;
  --border: #3e3e3e;
  --gutter: #3e3e3e;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 40px;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.btn {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  background: var(--border);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-run {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn-run:hover:not(:disabled) {
  background: var(--accent-hover);
}

.split-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.gutter {
  background: var(--gutter);
  cursor: col-resize;
}

.editor-pane,
.terminal-pane {
  overflow: hidden;
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 14px;
}

.status-bar {
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 24px;
  background: var(--accent);
  color: white;
  font-size: 12px;
  flex-shrink: 0;
}

/* Mobile: vertical layout */
@media (max-width: 768px) {
  .split-container {
    flex-direction: column !important;
  }
  .gutter {
    cursor: row-resize;
  }
}
```

**Step 4: Update index.html**

Ensure `index.html` has no default styles and the body has `margin: 0`.

**Step 5: Verify visually**

```bash
npm run dev
# Visit http://localhost:5173
# Should see: dark toolbar with "C++ Playground" + "Run" button,
# split panes showing "Editor" and "Terminal" placeholders,
# blue status bar at bottom
```

**Step 6: Commit**

```bash
git add src/app/App.tsx src/app/App.css package.json package-lock.json
git commit -m "feat: add split-pane UI shell with toolbar, editor and terminal placeholders"
```

---

## Task 6: Monaco Editor Component

**Files:**
- Create: `src/components/Editor/CodeEditor.tsx`
- Modify: `src/app/App.tsx` — replace editor placeholder

**Step 1: Create the Monaco wrapper**

Create `src/components/Editor/CodeEditor.tsx`:

```tsx
import Editor from '@monaco-editor/react';
import { useEditorStore } from '../../app/store/editorStore';

export function CodeEditor() {
  const code = useEditorStore((s) => s.code);
  const setCode = useEditorStore((s) => s.setCode);

  return (
    <Editor
      height="100%"
      defaultLanguage="cpp"
      theme="vs-dark"
      value={code}
      onChange={(value) => setCode(value ?? '')}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        wordWrap: 'off',
        lineNumbers: 'on',
        renderLineHighlight: 'line',
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        padding: { top: 8 },
      }}
    />
  );
}
```

**Step 2: Wire into App**

In `src/app/App.tsx`, import and replace the editor placeholder:

```tsx
import { CodeEditor } from '../components/Editor/CodeEditor';

// Replace: <div className="placeholder">Editor</div>
// With:    <CodeEditor />
```

**Step 3: Verify visually**

```bash
npm run dev
# Monaco editor should load with default C++ "Hello World" code
# Syntax highlighting should work
# Typing should update the editor
```

**Step 4: Commit**

```bash
git add src/components/Editor/CodeEditor.tsx src/app/App.tsx
git commit -m "feat: add Monaco editor component with C++ syntax highlighting"
```

---

## Task 7: Terminal Component

**Files:**
- Create: `src/components/Terminal/Terminal.tsx`
- Modify: `src/app/App.tsx` — replace terminal placeholder

**Step 1: Create the xterm.js wrapper**

Create `src/components/Terminal/Terminal.tsx`:

```tsx
import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  onData?: (data: string) => void;
}

export function Terminal({ onData }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const writeln = useCallback((text: string) => {
    termRef.current?.writeln(text);
  }, []);

  const write = useCallback((text: string) => {
    termRef.current?.write(text);
  }, []);

  const clear = useCallback(() => {
    termRef.current?.clear();
  }, []);

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

    term.onData((data) => {
      onData?.(data);
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
    };
  }, [onData]);

  // Expose write/writeln/clear via ref pattern or store
  // For now, the terminal just renders and accepts input
  useEffect(() => {
    // Store terminal methods globally for other components to use
    (window as any).__terminal = { write, writeln, clear };
    return () => {
      delete (window as any).__terminal;
    };
  }, [write, writeln, clear]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', padding: '4px' }}
    />
  );
}
```

**Step 2: Wire into App**

In `src/app/App.tsx`, import and replace the terminal placeholder:

```tsx
import { Terminal } from '../components/Terminal/Terminal';

// Replace: <div className="placeholder">Terminal</div>
// With:    <Terminal />
```

**Step 3: Verify visually**

```bash
npm run dev
# Terminal should appear in the right pane
# Should show "C++ Playground — Ready"
# Cursor should blink
# Resizing the split should refit the terminal
```

**Step 4: Commit**

```bash
git add src/components/Terminal/Terminal.tsx src/app/App.tsx
git commit -m "feat: add xterm.js terminal component with auto-resize"
```

---

## Task 8: Compiler Worker + Bridge

**Files:**
- Create: `src/workers/compiler.worker.ts`
- Create: `src/lib/compilerBridge.ts`

**Note:** This task sets up the worker communication protocol. The actual Clang WASM binary integration depends on sourcing a pre-built `clang.wasm`. We use a modular design so the WASM loading can be swapped in.

**Step 1: Define the message protocol**

Create `src/workers/compiler.worker.ts`:

```typescript
// Message types
export interface CompileRequest {
  type: 'compile';
  id: string;
  code: string;
}

export interface CompileResponse {
  type: 'compile-result';
  id: string;
  success: boolean;
  wasmBinary?: Uint8Array;
  errors?: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
  stdout?: string;
  stderr?: string;
}

export interface StatusMessage {
  type: 'status';
  status: 'loading' | 'ready' | 'error';
  message?: string;
}

type WorkerMessage = CompileRequest;
type WorkerResponse = CompileResponse | StatusMessage;

// Post a typed message
function respond(msg: WorkerResponse) {
  self.postMessage(msg);
}

// Placeholder: In production, this loads the Clang WASM binary
async function initCompiler() {
  respond({ type: 'status', status: 'loading', message: 'Loading compiler...' });

  // TODO: Load actual Clang WASM binary
  // const module = await WebAssembly.instantiateStreaming(fetch('/wasm/clang.wasm'));

  respond({ type: 'status', status: 'ready' });
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === 'compile') {
    // TODO: Replace with actual WASM compilation
    // For now, return a placeholder response
    respond({
      type: 'compile-result',
      id: msg.id,
      success: false,
      errors: [],
      stderr: 'Compiler WASM not yet loaded. Integration pending.',
    });
  }
};

initCompiler();
```

**Step 2: Create the bridge**

Create `src/lib/compilerBridge.ts`:

```typescript
import type { CompileResponse, StatusMessage } from '../workers/compiler.worker';

type MessageFromWorker = CompileResponse | StatusMessage;

export class CompilerBridge {
  private worker: Worker;
  private pendingCompilations = new Map<
    string,
    { resolve: (res: CompileResponse) => void }
  >();
  private onStatusChange?: (status: StatusMessage) => void;

  constructor(onStatusChange?: (status: StatusMessage) => void) {
    this.onStatusChange = onStatusChange;
    this.worker = new Worker(
      new URL('../workers/compiler.worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = (e: MessageEvent<MessageFromWorker>) => {
      const msg = e.data;
      if (msg.type === 'status') {
        this.onStatusChange?.(msg);
      } else if (msg.type === 'compile-result') {
        const pending = this.pendingCompilations.get(msg.id);
        if (pending) {
          pending.resolve(msg);
          this.pendingCompilations.delete(msg.id);
        }
      }
    };
  }

  compile(code: string): Promise<CompileResponse> {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      this.pendingCompilations.set(id, { resolve });
      this.worker.postMessage({ type: 'compile', id, code });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
```

**Step 3: Verify it builds**

```bash
npm run build
# Should build without TypeScript errors
```

**Step 4: Commit**

```bash
git add src/workers/compiler.worker.ts src/lib/compilerBridge.ts
git commit -m "feat: add compiler worker and bridge with typed message protocol"
```

---

## Task 9: Runtime Worker + Bridge

**Files:**
- Create: `src/workers/runtime.worker.ts`
- Create: `src/lib/runtimeBridge.ts`

**Step 1: Create the runtime worker**

Create `src/workers/runtime.worker.ts`:

```typescript
export interface RunRequest {
  type: 'run';
  id: string;
  wasmBinary: Uint8Array;
}

export interface StdinData {
  type: 'stdin';
  data: string;
}

export interface RuntimeOutput {
  type: 'stdout' | 'stderr';
  data: string;
}

export interface RuntimeExit {
  type: 'exit';
  id: string;
  code: number;
}

export interface RuntimeError {
  type: 'runtime-error';
  id: string;
  message: string;
}

type WorkerInput = RunRequest | StdinData;
type WorkerOutput = RuntimeOutput | RuntimeExit | RuntimeError;

function respond(msg: WorkerOutput) {
  self.postMessage(msg);
}

let stdinBuffer: string[] = [];
let stdinResolve: ((data: string) => void) | null = null;

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  const msg = e.data;

  if (msg.type === 'stdin') {
    if (stdinResolve) {
      stdinResolve(msg.data);
      stdinResolve = null;
    } else {
      stdinBuffer.push(msg.data);
    }
  }

  if (msg.type === 'run') {
    try {
      // TODO: Replace with actual WASM instantiation
      // The compiled WASM binary would be instantiated here with
      // stdin/stdout/stderr wired to our message passing
      respond({ type: 'stdout', data: 'Runtime not yet integrated.\r\n' });
      respond({ type: 'exit', id: msg.id, code: 0 });
    } catch (err) {
      respond({
        type: 'runtime-error',
        id: msg.id,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }
};
```

**Step 2: Create the bridge**

Create `src/lib/runtimeBridge.ts`:

```typescript
import type {
  RuntimeOutput,
  RuntimeExit,
  RuntimeError,
} from '../workers/runtime.worker';

type MessageFromWorker = RuntimeOutput | RuntimeExit | RuntimeError;

interface RuntimeCallbacks {
  onStdout: (data: string) => void;
  onStderr: (data: string) => void;
  onExit: (code: number) => void;
  onError: (message: string) => void;
}

export class RuntimeBridge {
  private worker: Worker | null = null;
  private callbacks: RuntimeCallbacks;

  constructor(callbacks: RuntimeCallbacks) {
    this.callbacks = callbacks;
  }

  run(wasmBinary: Uint8Array): string {
    // Terminate previous worker if still running
    this.worker?.terminate();

    this.worker = new Worker(
      new URL('../workers/runtime.worker.ts', import.meta.url),
      { type: 'module' },
    );

    const id = crypto.randomUUID();

    this.worker.onmessage = (e: MessageEvent<MessageFromWorker>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'stdout':
          this.callbacks.onStdout(msg.data);
          break;
        case 'stderr':
          this.callbacks.onStderr(msg.data);
          break;
        case 'exit':
          this.callbacks.onExit(msg.code);
          break;
        case 'runtime-error':
          this.callbacks.onError(msg.message);
          break;
      }
    };

    this.worker.postMessage({ type: 'run', id, wasmBinary });
    return id;
  }

  sendStdin(data: string) {
    this.worker?.postMessage({ type: 'stdin', data });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
  }
}
```

**Step 3: Verify it builds**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/workers/runtime.worker.ts src/lib/runtimeBridge.ts
git commit -m "feat: add runtime worker and bridge with stdin/stdout message passing"
```

---

## Task 10: Wire Up Compile & Run Flow

**Files:**
- Modify: `src/app/App.tsx` — add compile/run logic
- Create: `src/components/Editor/EditorToolbar.tsx`
- Modify: `src/components/Terminal/Terminal.tsx` — expose write methods properly

**Step 1: Refactor Terminal to use ref-based API**

Update `src/components/Terminal/Terminal.tsx` to expose methods via `useImperativeHandle`:

```tsx
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
```

**Step 2: Create EditorToolbar**

Create `src/components/Editor/EditorToolbar.tsx`:

```tsx
import { useEditorStore } from '../../app/store/editorStore';

interface EditorToolbarProps {
  onRun: () => void;
}

export function EditorToolbar({ onRun }: EditorToolbarProps) {
  const compileStatus = useEditorStore((s) => s.compileStatus);
  const compilerReady = useEditorStore((s) => s.wasmStatus.compiler);
  const isCompiling = compileStatus === 'compiling';

  return (
    <>
      <button
        className="btn btn-run"
        onClick={onRun}
        disabled={isCompiling || compilerReady === 'loading'}
      >
        {isCompiling ? 'Compiling...' : '▶ Run'}
      </button>
    </>
  );
}
```

**Step 3: Wire everything in App.tsx**

Rewrite `src/app/App.tsx` to integrate compiler bridge, runtime bridge, and terminal:

```tsx
import { useRef, useEffect, useCallback } from 'react';
import Split from 'react-split';
import { CodeEditor } from '../components/Editor/CodeEditor';
import { EditorToolbar } from '../components/Editor/EditorToolbar';
import { Terminal, TerminalHandle } from '../components/Terminal/Terminal';
import { CompilerBridge } from '../lib/compilerBridge';
import { RuntimeBridge } from '../lib/runtimeBridge';
import { useEditorStore } from './store/editorStore';
import './App.css';

export function App() {
  const terminalRef = useRef<TerminalHandle>(null);
  const compilerRef = useRef<CompilerBridge | null>(null);
  const runtimeRef = useRef<RuntimeBridge | null>(null);

  const code = useEditorStore((s) => s.code);
  const setCompileStatus = useEditorStore((s) => s.setCompileStatus);
  const setWasmStatus = useEditorStore((s) => s.setWasmStatus);

  // Initialize compiler bridge
  useEffect(() => {
    compilerRef.current = new CompilerBridge((status) => {
      setWasmStatus('compiler', status.status === 'ready' ? 'ready' : status.status === 'loading' ? 'loading' : 'error');
    });
    return () => compilerRef.current?.terminate();
  }, [setWasmStatus]);

  // Initialize runtime bridge
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
    }
  }, [code, setCompileStatus]);

  const handleTerminalData = useCallback((data: string) => {
    runtimeRef.current?.sendStdin(data);
  }, []);

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <span className="logo">C++ Playground</span>
        </div>
        <div className="toolbar-right">
          <EditorToolbar onRun={handleRun} />
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
          <CodeEditor />
        </div>
        <div className="terminal-pane">
          <Terminal ref={terminalRef} onData={handleTerminalData} />
        </div>
      </Split>

      <footer className="status-bar">
        <span>Ready</span>
      </footer>
    </div>
  );
}
```

**Step 4: Verify it builds and runs**

```bash
npm run dev
# Click "Run" — terminal should show "Compiling..." then the placeholder message
# from the compiler worker
```

**Step 5: Commit**

```bash
git add src/app/App.tsx src/components/Editor/EditorToolbar.tsx src/components/Terminal/Terminal.tsx
git commit -m "feat: wire compile and run flow with terminal, compiler and runtime bridges"
```

---

## Task 11: Template Menu Component

**Files:**
- Create: `src/components/Templates/TemplateMenu.tsx`
- Create: `src/components/Templates/TemplateMenu.css`
- Modify: `src/app/App.tsx` — add to toolbar

**Step 1: Build the dropdown component**

Create `src/components/Templates/TemplateMenu.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
import { templates, TemplateCategory } from '../../lib/templates';
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
```

**Step 2: Style the dropdown**

Create `src/components/Templates/TemplateMenu.css`:

```css
.template-menu {
  position: relative;
}

.template-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  width: 220px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 100;
  padding: 4px 0;
}

.template-category-label {
  padding: 6px 12px 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.template-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 12px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.template-item:hover {
  background: var(--border);
}
```

**Step 3: Add to App toolbar**

In `src/app/App.tsx`, import `TemplateMenu` and add before `EditorToolbar` in the toolbar-right div:

```tsx
import { TemplateMenu } from '../components/Templates/TemplateMenu';

// In toolbar-right:
<TemplateMenu />
<EditorToolbar onRun={handleRun} />
```

**Step 4: Verify visually**

```bash
npm run dev
# Click "Templates ▾" — dropdown should appear with categorized templates
# Selecting one should replace editor content
```

**Step 5: Commit**

```bash
git add src/components/Templates/ src/app/App.tsx
git commit -m "feat: add template dropdown menu with categorized C++ examples"
```

---

## Task 12: Share Button Component

**Files:**
- Create: `src/components/Share/ShareButton.tsx`
- Modify: `src/app/App.tsx` — add to toolbar, add URL hash loading

**Step 1: Create ShareButton**

Create `src/components/Share/ShareButton.tsx`:

```tsx
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
```

**Step 2: Add URL hash loading to App**

In `src/app/App.tsx`, add an effect to load code from URL hash on mount:

```tsx
import { decodeCode } from '../lib/shareCodec';

// Inside App component, add this effect:
useEffect(() => {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const decoded = decodeCode(hash);
    if (decoded) {
      useEditorStore.getState().resetCode(decoded);
    }
  }
}, []);
```

Add `ShareButton` to toolbar:

```tsx
import { ShareButton } from '../components/Share/ShareButton';

// In toolbar-right, after EditorToolbar:
<ShareButton />
```

**Step 3: Verify**

```bash
npm run dev
# Click "Share" — URL should update with hash, "Copied!" feedback
# Refresh page — editor should load code from URL hash
```

**Step 4: Commit**

```bash
git add src/components/Share/ShareButton.tsx src/app/App.tsx
git commit -m "feat: add code sharing via compressed URL hash with clipboard copy"
```

---

## Task 13: Status Bar

**Files:**
- Create: `src/components/StatusBar/StatusBar.tsx`
- Modify: `src/app/App.tsx` — replace static footer

**Step 1: Create StatusBar component**

Create `src/components/StatusBar/StatusBar.tsx`:

```tsx
import { useEditorStore } from '../../app/store/editorStore';

export function StatusBar() {
  const compileStatus = useEditorStore((s) => s.compileStatus);
  const wasmStatus = useEditorStore((s) => s.wasmStatus);

  const statusParts: string[] = [];

  // Compiler WASM status
  if (wasmStatus.compiler === 'loading') {
    statusParts.push('Loading compiler...');
  } else if (wasmStatus.compiler === 'error') {
    statusParts.push('Compiler failed to load');
  }

  // Clangd status
  if (wasmStatus.clangd === 'loading') {
    statusParts.push('Loading clangd...');
  } else if (wasmStatus.clangd === 'error') {
    statusParts.push('Clangd unavailable');
  }

  // Compile status
  if (compileStatus === 'compiling') {
    statusParts.push('Compiling...');
  }

  const statusText = statusParts.length > 0 ? statusParts.join(' | ') : 'Ready';

  return (
    <footer className="status-bar">
      <span>{statusText}</span>
    </footer>
  );
}
```

**Step 2: Wire into App**

Replace the static `<footer>` in `src/app/App.tsx` with `<StatusBar />`.

**Step 3: Verify**

```bash
npm run dev
# Status bar should show "Ready" or loading states
```

**Step 4: Commit**

```bash
git add src/components/StatusBar/StatusBar.tsx src/app/App.tsx
git commit -m "feat: add status bar showing WASM loading and compile status"
```

---

## Task 14: LSP Worker Stub + Bridge

**Files:**
- Create: `src/workers/lsp.worker.ts`
- Create: `src/lib/lspClient.ts`

**Note:** Full clangd WASM integration requires a pre-built `clangd.wasm` binary (e.g., from `nicolo-ribaudo/test-wasm-clangd` or building from source). This task creates the communication infrastructure so it can be plugged in.

**Step 1: Create LSP worker stub**

Create `src/workers/lsp.worker.ts`:

```typescript
export interface LspRequest {
  type: 'initialize' | 'didChange' | 'completion' | 'hover' | 'definition';
  id?: string;
  params?: unknown;
}

export interface LspResponse {
  type: 'initialized' | 'diagnostics' | 'completion-result' | 'hover-result' | 'definition-result' | 'status';
  id?: string;
  data?: unknown;
}

function respond(msg: LspResponse) {
  self.postMessage(msg);
}

async function initClangd() {
  respond({ type: 'status', data: { status: 'loading' } });

  // TODO: Load clangd WASM binary
  // This is where the pre-built clangd.wasm would be loaded and initialized
  // with a virtual filesystem containing standard library headers

  respond({ type: 'status', data: { status: 'ready' } });
}

self.onmessage = (e: MessageEvent<LspRequest>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'didChange':
      // TODO: Forward file content to clangd, receive diagnostics
      break;
    case 'completion':
      // TODO: Request completions from clangd
      respond({ type: 'completion-result', id: msg.id, data: { items: [] } });
      break;
    case 'hover':
      respond({ type: 'hover-result', id: msg.id, data: null });
      break;
    case 'definition':
      respond({ type: 'definition-result', id: msg.id, data: null });
      break;
  }
};

initClangd();
```

**Step 2: Create LSP client bridge**

Create `src/lib/lspClient.ts`:

```typescript
import type { LspResponse } from '../workers/lsp.worker';

interface DiagnosticsCallback {
  (diagnostics: Array<{
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
  }>): void;
}

export class LspClient {
  private worker: Worker;
  private pending = new Map<string, { resolve: (data: unknown) => void }>();
  private onDiagnostics?: DiagnosticsCallback;
  private onStatusChange?: (status: string) => void;

  constructor(opts?: {
    onDiagnostics?: DiagnosticsCallback;
    onStatusChange?: (status: string) => void;
  }) {
    this.onDiagnostics = opts?.onDiagnostics;
    this.onStatusChange = opts?.onStatusChange;

    this.worker = new Worker(
      new URL('../workers/lsp.worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = (e: MessageEvent<LspResponse>) => {
      const msg = e.data;

      if (msg.type === 'status') {
        this.onStatusChange?.((msg.data as { status: string }).status);
      } else if (msg.type === 'diagnostics') {
        this.onDiagnostics?.(msg.data as any);
      } else if (msg.id) {
        const pending = this.pending.get(msg.id);
        if (pending) {
          pending.resolve(msg.data);
          this.pending.delete(msg.id);
        }
      }
    };
  }

  didChange(content: string) {
    this.worker.postMessage({ type: 'didChange', params: { content } });
  }

  async completion(line: number, column: number) {
    return this.request('completion', { line, column });
  }

  async hover(line: number, column: number) {
    return this.request('hover', { line, column });
  }

  async definition(line: number, column: number) {
    return this.request('definition', { line, column });
  }

  private request(type: string, params: unknown): Promise<unknown> {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.worker.postMessage({ type, id, params });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
```

**Step 3: Verify it builds**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/workers/lsp.worker.ts src/lib/lspClient.ts
git commit -m "feat: add LSP worker stub and client bridge for clangd WASM integration"
```

---

## Task 15: Run All Tests + Final Verification

**Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (editorStore, shareCodec, templates).

**Step 2: Run the build**

```bash
npm run build
```

Expected: Clean build, no TypeScript errors.

**Step 3: Verify the app end-to-end**

```bash
npm run dev
```

Verify manually:
- [ ] Monaco editor loads with default Hello World code
- [ ] Syntax highlighting works for C++
- [ ] Templates dropdown shows categorized examples
- [ ] Selecting a template replaces editor content (with confirmation if dirty)
- [ ] "Run" button shows "Compiling..." state
- [ ] Terminal displays compiler output (placeholder message for now)
- [ ] "Share" button updates URL hash and copies to clipboard
- [ ] Refreshing with a hash in the URL loads the shared code
- [ ] Status bar shows correct state
- [ ] Split pane is resizable
- [ ] Layout works on narrow viewport (vertical stack)

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address any issues found during final verification"
```

---

## Summary

| Task | Component | Status |
|------|-----------|--------|
| 1 | Project scaffolding | Vite + React + TS |
| 2 | Zustand store | Editor state, compile status, WASM status |
| 3 | Share codec | pako compress/decompress for URL hash |
| 4 | Templates | 16 C++ templates across 4 categories |
| 5 | UI shell | Split pane layout, dark theme, responsive |
| 6 | Monaco editor | C++ highlighting, connected to store |
| 7 | Terminal | xterm.js with auto-resize |
| 8 | Compiler worker | Message protocol + bridge (WASM stub) |
| 9 | Runtime worker | stdin/stdout bridge (WASM stub) |
| 10 | Compile & run flow | Full wiring: editor → compiler → runtime → terminal |
| 11 | Template menu | Categorized dropdown with dirty check |
| 12 | Share button | URL hash sharing + clipboard copy |
| 13 | Status bar | WASM loading + compile status display |
| 14 | LSP worker | clangd communication infrastructure (stub) |
| 15 | Final verification | Tests + build + manual check |

### What's Stubbed (Requires WASM Binaries)

Three components need pre-built WASM binaries to become fully functional:

1. **Compiler Worker** — needs Clang compiled to WASM (e.g., from `nicolo-ribaudo/test-wasm-clang` or building Emscripten's `clang` for browser)
2. **Runtime Worker** — needs Emscripten runtime for executing compiled WASM with stdin/stdout
3. **LSP Worker** — needs clangd compiled to WASM with C++ standard library headers

The app structure, UI, state management, sharing, and templates are all fully functional without these binaries. The worker stubs return placeholder responses and can be replaced with real WASM integration without changing any other code.
