import { TextScanner } from "./text-scanner.js";
import { VirtualGrid } from "./virtual-grid.js";

/**
 * Encapsulated OS Control Center Custom Element (<sys-dashboard>).
 * Declares Open Shadow Root boundaries, provides style containment,
 * and tracks layout properties safely using WeakMap registries.
 */
export class SysDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // WeakMaps for DOM Node metadata tracking (prevents memory leaks by auto-GC)
    this.elementMetadata = new WeakMap();

    // Render Scoped Shadow Root structure
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          background-color: var(--sys-bg, #090d16);
          color: var(--sys-color, #e2e8f0);
          border: 1px solid #1e293b;
          border-radius: 12px;
          height: 100%;
          overflow: hidden;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
        .header {
          padding: 16px;
          border-b: 1px solid #1e293b;
          background: #0f172a;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .title {
          font-weight: 800;
          font-size: 14px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--sys-accent, #6366f1);
        }
        .search-input {
          background: #020617;
          border: 1px solid #334155;
          border-radius: 6px;
          color: #fff;
          padding: 6px 12px;
          font-size: 12px;
          font-family: monospace;
          width: 200px;
          transition: border-color 0.2s;
        }
        .search-input:focus {
          border-color: var(--sys-accent, #6366f1);
          outline: none;
        }
        .container {
          flex: 1;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .grid-wrapper {
          flex: 1;
          position: relative;
        }
      </style>
      <div class="header">
        <span class="title">📋 Process Scanner</span>
        <input type="text" class="search-input" placeholder="Surgical query..." />
      </div>
      <div class="container">
        <div class="grid-wrapper">
          <virtual-grid></virtual-grid>
        </div>
      </div>
    `;

    this.grid = this.shadowRoot.querySelector("virtual-grid");
    this.searchInput = this.shadowRoot.querySelector(".search-input");

    // Bind search event listeners
    this.searchInput.addEventListener("input", (e) =>
      this._onSearch(e.target.value),
    );
  }

  /**
   * Hooks data to the dashboard and builds the list dynamically.
   * @param {object[]} records - In-Memory database arrays.
   */
  loadData(records) {
    // Clear elements metadata map
    this.elementMetadata = new WeakMap();

    // Map rows cleanly inside virtual grid scroller
    this.grid.configure(records, 56, (item, index) => {
      const row = document.createElement("div");
      row.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 100%;
        padding: 0 16px;
        border-bottom: 1px solid #1e293b;
        font-family: monospace;
        font-size: 12px;
      `;

      row.innerHTML = `
        <span style="color: #6366f1; font-weight: bold;">${item.id}</span>
        <span class="title-text" style="color: #fff; flex: 1; margin: 0 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.title}</span>
        <span style="background: #020617; border: 1px solid #1e293b; color: #94a3b8; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${item.genre}</span>
      `;

      // WeakMap integration: Track list indices safely using WeakMap keys
      this.elementMetadata.set(row, { index, originalData: item });

      row.addEventListener("click", () => this._onRowClick(row));
      return row;
    });

    // Instantiate text scanner directly within shadow DOM container
    this.textScanner = new TextScanner(
      this.grid.shadowRoot.querySelector(".scroller-content"),
    );
  }

  /**
   * Event Dispatcher highlighting matches across visible virtual elements.
   * @private
   */
  _onSearch(term) {
    if (this.textScanner) {
      // Re-run the surgical document highlighter across visible viewport rows
      this.textScanner.highlight(term);
    }
  }

  /**
   * @private
   */
  _onRowClick(rowElement) {
    const meta = this.elementMetadata.get(rowElement);
    if (meta) {
      // Emit isolated web component custom interaction event
      this.dispatchEvent(
        new CustomEvent("row-selected", {
          detail: { index: meta.index, data: meta.originalData },
          bubbles: true,
          composed: true, // Escapes shadow root boundaries
        }),
      );
    }
  }
}

customElements.define("sys-dashboard", SysDashboard);
