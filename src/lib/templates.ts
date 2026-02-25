export type TemplateCategory = 'basics' | 'data-structures' | 'algorithms' | 'io';

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  code: string;
  description: string;
}

export const templates: Template[] = [
  // Basics (4): Hello World, Variables & Types, Control Flow, Functions
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
    int x = 10;
    if (x > 5) {
        cout << x << " is greater than 5" << endl;
    } else {
        cout << x << " is not greater than 5" << endl;
    }

    cout << "Counting: ";
    for (int i = 1; i <= 5; i++) {
        cout << i << " ";
    }
    cout << endl;

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

  // I/O (3): cin/cout, String Input, Reading Until EOF
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

  // Data Structures (5): Vector, Map, Set, Stack/Queue, Pair/Tuple
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
    stack<int> st;
    st.push(1); st.push(2); st.push(3);

    cout << "Stack (top first): ";
    while (!st.empty()) {
        cout << st.top() << " ";
        st.pop();
    }
    cout << endl;

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
    pair<string, int> p = {"Alice", 95};
    cout << p.first << " scored " << p.second << endl;

    vector<pair<string, int>> scores = {
        {"Alice", 95}, {"Bob", 87}, {"Charlie", 92}
    };
    sort(scores.begin(), scores.end(),
         [](const auto& a, const auto& b) { return a.second > b.second; });

    cout << "Ranking:" << endl;
    for (const auto& [name, score] : scores) {
        cout << "  " << name << ": " << score << endl;
    }

    auto [x, y, z] = make_tuple(1, 2.5, "hello");
    cout << x << ", " << y << ", " << z << endl;

    return 0;
}
`,
  },

  // Algorithms (4): Sorting, Binary Search, BFS/DFS, DP
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

    sort(nums.begin(), nums.end());
    cout << "Ascending: ";
    for (int n : nums) cout << n << " ";
    cout << endl;

    sort(nums.begin(), nums.end(), greater<int>());
    cout << "Descending: ";
    for (int n : nums) cout << n << " ";
    cout << endl;

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

long long fib(int n, vector<long long>& memo) {
    if (n <= 1) return n;
    if (memo[n] != -1) return memo[n];
    return memo[n] = fib(n - 1, memo) + fib(n - 2, memo);
}

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
    int n = 40;
    vector<long long> memo(n + 1, -1);
    cout << "fib(" << n << ") = " << fib(n, memo) << endl;

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
