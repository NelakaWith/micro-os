# Vanilla Micro-OS & In-Memory Transactional Database

A high-performance, zero-dependency Micro-Operating System simulator and ACID-compliant transactional in-memory database built entirely from first principles in pure ES6+ JavaScript.

This project is an architectural study in clearing the "framework fog," bypassing standard client-side performance bottlenecks (such as layout thrashing, $O(N)$ collection sweeps, and JSON-cloning IPCs) to interface directly with browser layout, memory, and multi-threading models.

## 🏗️ System Architecture & Design Constraints

The system is constructed as a distributed, event-driven architecture partitioned across five core modules, communicating through transactional logs, priority queues, and zero-overhead thread messaging channels.

```
                  ┌────────────────────────────────────────┐
                  │          Main Browser Thread           │
                  │                                        │
                  │   ┌────────────────────────────────┐   │
                  │   │      Surgical Paint Engine     │   │
                  │   └───────────────┬────────────────┘   │
                  │                   │ DOM Mutations      │
                  │                   ▼                    │
                  │   ┌────────────────────────────────┐   │
                  │   │      Reactive Data Store       │   │
                  │   │      (WeakMaps & Indices)      │   │
                  │   └───────────────▲────────────────┘   │
                  │                   │                    │
                  └───────────────────┼────────────────────┘
                                      │ MessagePort (PostMessage)
                  ┌───────────────────▼────────────────────┐
                  │           Web Worker Thread            │
                  │                                        │
                  │   ┌────────────────────────────────┐   │
                  │   │     Background Query Engine    │   │
                  │   │       (In-Memory B-Tree)       │   │
                  │   └────────────────────────────────┘   │
                  └────────────────────────────────────────┘
```

### Core Architecture Design Pillars

1. **Zero-Dependency Mandate:** No libraries, frameworks, bundlers, or compilation runtimes. Built using pure ES6 modules and browser APIs.
2. **Surgical Pointer Precision:** State management leverages reference tracking, index hash maps, and doubly-linked pointer updates to achieve $O(1)$ runtimes.
3. **Strict Memory Isolation:** Data encapsulation is strictly enforced. Consuming layers never access master records directly; all queries and updates are protected via decoupling deep-copies.
4. **Frame-Rate Budgeting:** Background computations are thread-isolated, and UI paint updates are scheduled programmatically via `requestAnimationFrame` to run within a tight $\le 10\text{ms}$ execution window, preserving a continuous $60\text{Hz}$ screen draw rate.

## 🛠️ Module Specifications

### Module 1: The Core In-Memory Engine (The Database)

An ACID-compliant, indexed key-value engine with history undo/redo structures and transaction isolation.

- **Primary and Secondary Indexes:** Master records live in a primary hash `Map`. Dynamically registered properties maintain secondary index maps (`Map<string, Map<any, Set<string>>>`), converting linear query searches from slow $O(N)$ table sweeps to instantaneous $O(1)$ map lookups.
- **ACID Transactions:** Full support for `beginTransaction()`, `commit()`, and `rollback()`. Utilizes isolation logs (`snapshots`, `newIds`, and `deletedIds`) to capture the exact state pre-transaction. The engine guarantees transactional isolation by only snapshotting the _first_ mutated state of an item inside an active transaction block.
- **Command Pattern History Stacks:** Implements a decoupled undo/redo architecture via discrete `DBCommand` wrappers containing serializable forward execution and reverse rollback vectors.
- **O(1) LRU Cache:** Custom Least Recently Used query cache implemented from scratch using a **Doubly Linked List** and a lookup `Map`. This bypasses array index shifting delays ($O(N)$ elements reflows) to perform element promotion and cold eviction in $O(1)$ time.

### Module 2: The Multi-Threaded Processor (Web Workers)

Offloads resource-intensive query compilation, filtering, and sorting to secondary hardware threads, preventing UI frame drops.

- **Inline Web Workers:** Spin up workers dynamically using string-serialized scripts passed through `URL.createObjectURL` to remain entirely client-side and CORS-safe.
- **Transferable Objects:** Passes query sets across boundaries using `ArrayBuffer` objects within **transferable lists**, transferring raw memory ownership between contexts instantly in $O(1)$ time without structured clone duplicate CPU costs.
- **Worker Pool Scheduler:** Implements a main-thread supervisor queue handling thread limits, timeouts, retries, and dynamic scaling.

### Module 3: The Surgical Rendering Engine (The View)

High-performance rendering without virtual-DOM overhead.

- **Virtual Grid / List Recycler:** An infinite visual scroller that monitors container heights and recycles a small, fixed pool of layout components to represent large datasets, avoiding massive memory allocations.
- **Paint Batching (DocumentFragments):** Batches dynamic DOM additions inside an off-screen container fragment before introducing it to the visible tree in a single rendering recalculation.
- **Surgical Highlight Scanner (TreeWalker):** Traverses live DOM text nodes directly using native `TreeWalker` systems, isolating and highlighting queries surgically by creating `Range` boundaries and wrapping text in a styled inline marker without recreating surrounding parent containers.

### Module 4: The Reactive Pipeline & Streams (Asynchrony)

Ingests and schedules telemetry events under a strict CPU timeframe.

- **Async Generators:** Continuously yields simulated system metrics (such as CPU, RAM, database write latency) via `async function*` loops.
- **Binary Heap Priority Queue:** Organizes system alerts using an in-memory Binary Heap from scratch, guaranteeing that critical events (e.g., "Out of Memory") jump to the front of the queue in $O(\log N)$ time.
- **requestAnimationFrame Budgeting:** Loops through the priority queue and executes updates in scheduled frames, tracking processing duration using `performance.now()` to automatically yield execution to the browser paint stage before exceeding $10\text{ms}$.

### Module 5: Shadow DOM & Metadata (Isolation & Leak Safety)

Components are encapsulated and isolated against style pollution and memory leaks.

- **Shadow DOM Isolation:** Wraps layout inside a custom element (`customElements.define('sys-dashboard', ...)`) using an open shadow root to completely block external CSS cascades.
- **WeakMap Metadata Registry:** Stores temporary, runtime element state metadata (such as active state, toggle state, or focus flags) inside a dedicated `WeakMap` with DOM node keys. This guarantees that when a DOM node is removed, its metadata is instantly cleared from memory by the garbage collector, preventing **Detached DOM Element** leaks.

## 📂 Project Directory Structure

```
vanilla-micro-os/
│
├── index.html                  # Main entrypoint layout. Loads orchestrator script
├── styles.css                  # CSS Variables & main theme configuration
├── README.md                   # System Architecture & API documentation
│
├── src/
│   ├── main.js                 # System Orchestrator. Bootstraps and registers modules
│   │
│   ├── db/                     # MODULE 1: Transactional Database Engine
│   │   ├── lru-cache.js        # Doubly Linked List and O(1) Cache map pointer tracking
│   │   ├── db-command.js       # Command classes for transaction rollback/undo/redo
│   │   └── db-engine.js        # Indexes, isolation loggers, and ACID transactions
│   │
│   ├── worker/                 # MODULE 2: Web Workers
│   │   ├── query-worker.js     # Heavy array parsing, filter, and sort thread-side
│   │   └── worker-pool.js      # Supervisor queue and transferable object manager
│   │
│   ├── ui/                     # MODULE 3 & 5: Layout & Encapsulation
│   │   ├── sys-dashboard.js    # Custom Element declaring Shadow Root
│   │   ├── virtual-grid.js     # Viewport virtualization element list scroller
│   │   └── text-scanner.js     # TreeWalker text node query parser and highlighter
│   │
│   └── streams/                # MODULE 4: Pipelines & Schedulers
│       ├── data-streams.js     # Async Generators telemetry data flow
│       ├── priority-queue.js   # Binary Heap sorting events by level
│       └── frame-scheduler.js  # requestAnimationFrame budget executor
│
└── tests/
    └── browser_test_bench.html # Dynamic visual testing dashboard and automated runner
```

## 📊 Algorithmic Time Complexities

The Micro-OS is mathematically optimized to guarantee high speed across all core operations:

| Operation                     | Complexity  | Structural Underpinnings                                          |
| ----------------------------- | ----------- | ----------------------------------------------------------------- |
| **Primary Key Lookup**        | $O(1)$      | V8-Engine Primary Hash `Map` Lookup                               |
| **Secondary Indexed Query**   | $O(1)$      | Nested map lookup resolving directly to record sets               |
| **Fallback Scan Query**       | $O(N)$      | Full linear dataset sequence traversal                            |
| **LRU Cache Retrieve & Move** | $O(1)$      | Doubly Linked List pointer re-linking                             |
| **LRU Cache Cold Eviction**   | $O(1)$      | Severing links of the node preceding `Tail` boundary              |
| **Command Execution**         | $O(1)$      | Instant Map operations                                            |
| **Linear Command Undo/Redo**  | $O(1)$      | History Array Stack pops and inverted execution                   |
| **Active Transaction Update** | $O(1)$      | First-mutation snapshot logging                                   |
| **Transaction Rollback**      | $O(M)$      | Reverting snapshot states ($M = \text{number of modified items}$) |
| **Event Priority Insertion**  | $O(\log N)$ | Binary Heap node bubbling                                         |
| **Thread IPC Data Transfers** | $O(1)$      | Transferable `ArrayBuffer` ownership hand-off                     |

## 🚀 Running the Project

Because the system leverages native ES Modules, modern browsers prevent direct execution from the filesystem via the `file://` protocol due to CORS security policies. The project must be served from an HTTP server.

### Option 1: Zero-Install NPX (Recommended)

You can serve the project instantly using Node's package executor from your project root:

```
npx http-server -p 8080 -o
```

This spins up a lightweight server and automatically opens your browser pointing to `http://localhost:8080`. Navigating to `tests/browser_test_bench.html` loads your core engine modules directly.

### Option 2: Local Script Integration (Console Ninja Compatible)

To ensure extensions like Console Ninja actively instrument and pipe logs directly to your editor, configure `http-server` as a local project dependency:

1. Initialize project metadata inside the root directory:

   ```
   npm init -y
   ```

2. Install the server package locally:

   ```
   npm install http-server --save-dev
   ```

3. Insert a dedicated execution configuration inside your `package.json` scripts block:

   ```
   "scripts": {
     "start": "http-server -p 8080 -o"
   }
   ```

4. Run the local script:

   ```
   npm start
   ```

## 🧠 Senior Architectural Interview Drill

Here are the key low-level browser design questions addressed inside this project's code structure:

### 1. Why did we choose `WeakMap` over a standard `Map` to track element metadata?

A standard `Map` holds strong references to its keys. If a DOM node is removed from the active layout, but still exists as a key in a static `Map`, the JS garbage collector cannot retrieve that memory, resulting in a **Detached DOM Element** memory leak. `WeakMap` holds keys weakly; when the DOM node is removed and has no other references, both the node and its mapped metadata are automatically freed.

### 2. What is the benefit of passing transferable objects to our Web Worker?

Standard `postMessage` calls copy parameters using the structured clone algorithm. For large datasets, this blocks both the sending and receiving threads as memory is serialized, duplicated, and deserialized. Transferring an `ArrayBuffer` dynamically transfers ownership of the memory reference itself—making the dataset instantly accessible in the worker with $O(1)$ cost, without duplicating the structure in RAM.

### 3. How does your paint budget scheduler prevent layout "Jank"?

Browser layout engines paint screens at $60\text{Hz}$, requiring a new frame every $16.67\text{ms}$. Within this tiny timeframe, the browser must run style recalculation, layout formatting, paint allocation, and composite blending. By scheduling all DOM mutations inside a `requestAnimationFrame` loop, checking operational time via `performance.now()`, and yielding control back to the layout engine if operations exceed $\le 10\text{ms}$, we guarantee the browser has sufficient headroom to draw frames smoothly without stuttering.
