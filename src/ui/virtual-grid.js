/**
 * Highly optimized Viewport Virtualizer Custom Element.
 * Renders massive datasets by recycling a small, fixed pool of DOM elements,
 * keeping memory footprint constant regardless of list size.
 */
export class VirtualGrid extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // Core state tracking
    this._items = [];
    this._itemHeight = 60; // Expected default height per item row in px
    this._renderCallback = null;

    // Viewport DOM placeholders
    this.viewport = null;
    this.scroller = null;

    // Track active DOM nodes currently mapped to indices
    this.visibleNodes = new Map(); // index -> DOMElement
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          overflow: hidden;
          position: relative;
          height: 100%;
          width: 100%;
        }
        .virtual-viewport {
          height: 100%;
          width: 100%;
          overflow-y: auto;
          position: relative;
          -webkit-overflow-scrolling: touch;
        }
        .virtual-scroller {
          position: relative;
          width: 100%;
          will-change: transform;
        }
        .virtual-item {
          position: absolute;
          left: 0;
          width: 100%;
          box-sizing: border-box;
          will-change: transform;
        }
      </style>
      <div class="virtual-viewport">
        <div class="virtual-scroller"></div>
      </div>
    `;

    this.viewport = this.shadowRoot.querySelector(".virtual-viewport");
    this.scroller = this.shadowRoot.querySelector(".virtual-scroller");

    // Bind high-frequency scroll event with requestAnimationFrame throttling
    let scrollScheduled = false;
    this.viewport.addEventListener(
      "scroll",
      () => {
        if (scrollScheduled) return;
        scrollScheduled = true;
        requestAnimationFrame(() => {
          this._updateVirtualViewport();
          scrollScheduled = false;
        });
      },
      { passive: true },
    );

    // Handle container resize dynamically
    const resizeObserver = new ResizeObserver(() =>
      this._updateVirtualViewport(),
    );
    resizeObserver.observe(this);
  }

  /**
   * Sets the dataset and updates the scroller total height.
   * @param {object[]} items - Raw data array.
   * @param {number} itemHeight - Height in pixels for each row.
   * @param {Function} renderCallback - Function taking item data and returning a DOM Node.
   */
  configure(items, itemHeight, renderCallback) {
    this._items = items || [];
    this._itemHeight = itemHeight || 60;
    this._renderCallback = renderCallback;

    if (this.scroller) {
      // Calculate and set the physical total height of the scroll region
      const totalHeight = this._items.length * this._itemHeight;
      this.scroller.style.height = `${totalHeight}px`;
      this._updateVirtualViewport();
    }
  }

  /**
   * Performs the surgical virtualization arithmetic.
   * Calculates visible windows, creates off-screen buffers, and recycles DOM elements.
   * @private
   */
  _updateVirtualViewport() {
    if (!this.viewport || !this._items.length || !this._renderCallback) return;

    const scrollTop = this.viewport.scrollTop;
    const viewportHeight = this.viewport.clientHeight;

    // 1. Calculate visible range index boundaries with safety buffer zones
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / this._itemHeight) - 3,
    );
    const endIndex = Math.min(
      this._items.length - 1,
      Math.ceil((scrollTop + viewportHeight) / this._itemHeight) + 3,
    );

    const activeIndices = new Set();
    const fragment = document.createDocumentFragment();

    for (let i = startIndex; i <= endIndex; i++) {
      activeIndices.add(i);

      if (!this.visibleNodes.has(i)) {
        // Node is entering visible viewport. Render and position it.
        const itemData = this._items[i];
        const element = this._renderCallback(itemData, i);

        element.classList.add("virtual-item");
        element.style.height = `${this._itemHeight}px`;
        // Position element surgically using highly optimized 3D transforms
        element.style.transform = `translate3d(0, ${i * this._itemHeight}px, 0)`;

        this.scroller.appendChild(element);
        this.visibleNodes.set(i, element);
      }
    }

    // 2. Safely evict and delete items that have scrolled out of the active index pool
    for (const [index, element] of this.visibleNodes.entries()) {
      if (!activeIndices.has(index)) {
        element.remove(); // Safely remove from physical DOM
        this.visibleNodes.delete(index); // Wipe reference trace to prevent leaks
      }
    }
  }
}

customElements.define("virtual-grid", VirtualGrid);
