# Module 3: The Surgical Rendering Engine (The View)

This module is your practical lab to master DOM layouts and viewport performance optimizations. You will build a viewport virtualizer and a text highlighter to manage massive data sets at a flawless $60\text{Hz}$ frame rate.

## 1. Architectural Deep-Dive & Mental Model

Most UI frameworks rely on a **Virtual DOM** to handle rendering updates. When displaying 15,000 lists, they still instantiate 15,000 virtual object structures, calculate diffs, and batch layout passes. At scale, this object-overhead degrades memory profiles.

In **Module 3**, you bypass the Virtual DOM entirely, mapping data straight to screen elements using direct DOM manipulation techniques:

```
  =========================================
  ◄───[ Virtual Scroller Container ]────►
  =========================================
  ┌───────────────────────────────────────┐ ◄─── Hidden Buffer Area (3 rows)
  │  [Item 17] - Recycled Node            │
  ├───────────────────────────────────────┤
  │  [Item 18] - Recycled Node            │
  ├───────────────────────────────────────┤
  │  [Item 19] - Recycled Node            │
  ╠═══════════════════════════════════════╣ ◄─── Viewport Top Boundary (scrollTop)
  ║  [Item 20] - Active Visible Row       ║
  ║  [Item 21] - Active Visible Row       ║
  ║  [Item 22] - Active Visible Row       ║
  ║  [Item 23] - Active Visible Row       ║
  ╠═══════════════════════════════════════╣ ◄─── Viewport Bottom Boundary
  │  [Item 24] - Recycled Node            │
  ├───────────────────────────────────────┤
  │  [Item 25] - Recycled Node            │
  └───────────────────────────────────────┘ ◄─── Hidden Buffer Area (3 rows)
  =========================================
```

### The Core Architectural Pillars

#### A. Viewport Virtualization

Instead of generating 15,000 HTML elements (which triggers massive browser layout reflows), we render a small pool of elements ($N \approx 20$) that fit on the user's screen.

- As the user scrolls, we calculate the current top position (`scrollTop`), determine which indices are entering the viewport, and shift the existing elements vertically using 3D translations (`translate3d(0, y, 0)`). 3D transformations are handled by the computer's GPU, skipping expensive CPU layout reflows completely.

#### B. Direct TreeWalker Traversal

Standard text highlighters search the DOM using `element.innerHTML.replace()`. This parses the raw HTML string, destroys existing DOM nodes, and recreates them, instantly breaking all active event listeners.

- **The Solution:** We utilize the native browser `TreeWalker` API. This API walks directly along the DOM text-node paths, ignoring HTML tags. When a match is found, we extract the precise character boundaries using the `Range` API and wrap only the matching text in a `<span>` highlight node, leaving adjacent nodes untouched.

## 2. Low-Level Component Anatomy

### `VirtualGrid` (Viewport Virtualization Custom Element)

This custom element wraps your scrolling panel. It calculates heights and swaps data elements inside a layout shadow DOM:

```jsx
import { VirtualGrid } from './src/ui/virtual-grid.js';

// Setup dataset and container height
const items = Array.from({ length: 15000 }, (_, i) => ({
  id: `track-${i}`,
  title: `Electronic track #${i}`,
  genre: 'Electronic'
}));

const virtualGrid = document.querySelector('virtual-grid');

// Pass items, expected row height in px, and custom element builder
virtualGrid.configure(items, 60, (itemData, index) => {
  const row = document.createElement('div');
  row.className = "flex justify-between items-center px-4 border-b border-slate-800 text-sm";
  row.innerHTML = `
    <span class="text-indigo-400 font-mono">${itemData.id}</span>
    <span class="text-white font-medium">${itemData.title}</span>
    <span class="text-slate-400">${itemData.genre}</span>
  `;
  return row;
});
```

### `TextScanner` (Surgical DOM Text Scanning Engine)

Wraps target DOM elements and applies highlighted styling dynamically:

```jsx
import { TextScanner } from './src/ui/text-scanner.js';

const targetContainer = document.getElementById('primary-visualizer');
const scanner = new TextScanner(targetContainer);

// Highlight any instance of the term "Edited"
scanner.highlight('Edited');

// Clear matches and restore original DOM structure
scanner.clear();
```

## 3. Real-Time Diagnostics & Performance Check

To verify that your Virtual Renderer is working correctly:

1. Open Chrome DevTools ($F12$), head to the **Elements** panel, and expand the shadow root inside `<virtual-grid>`.
2. Scroll down. Notice that the total number of HTML nodes inside `<div class="virtual-scroller">` remains completely static (hovering around 15–20 elements), while their styles and values change dynamically.
3. Open the **Performance** tab, record a scroll action, and observe the timeline. You will find that **Layout** and **Update Layer Tree** operations take $0.00\text{ms}$, keeping your frame budget safely under the $16.67\text{ms}$ limit.