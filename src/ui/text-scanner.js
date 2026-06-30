/**
 * Surgical DOM Text Scanner.
 * Employs native document TreeWalkers and DocumentFragment injection to isolate
 * search terms, highlighting strings directly in text nodes without shifting indices or crashing the browser.
 */
export class TextScanner {
  /**
   * @param {HTMLElement} container - The wrapper DOM Node to search inside.
   */
  constructor(container) {
    if (!container) {
      throw new Error("TextScanner needs an active container to traverse.");
    }
    this.container = container;
    this.highlights = []; // Stack of active document restore references
  }

  /**
   * Scans target text nodes directly and swaps them with fragment nodes containing highlighted elements.
   * Bypasses innerHTML, preserving active JS event listeners on elements.
   * @param {string} searchTerm - String text to highlight.
   */
  highlight(searchTerm) {
    this.clear(); // Revert former highlights first

    if (
      !searchTerm ||
      typeof searchTerm !== "string" ||
      searchTerm.trim() === ""
    ) {
      return;
    }

    const searchLower = searchTerm.toLowerCase();

    // 1. Initialize document TreeWalker focused strictly on TEXT_NODES
    const walker = document.createTreeWalker(
      this.container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (parent) {
            const tagName = parent.tagName.toUpperCase();
            if (
              tagName === "SCRIPT" ||
              tagName === "STYLE" ||
              parent.classList.contains("scanner-highlight")
            ) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    const textNodes = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      textNodes.push(currentNode);
      currentNode = walker.nextNode();
    }

    // 2. Iterate backward through the found text nodes to safely replace them
    for (let i = textNodes.length - 1; i >= 0; i--) {
      const node = textNodes[i];
      const textVal = node.nodeValue;
      const textLower = textVal.toLowerCase();
      let matchIdx = textLower.indexOf(searchLower);

      if (matchIdx === -1) continue; // Skip if no occurrences found

      const fragment = document.createDocumentFragment();
      let lastIdx = 0;

      // Extract all matched character instances within this isolated text element
      while (matchIdx !== -1) {
        // Append text before the match
        if (matchIdx > lastIdx) {
          fragment.appendChild(
            document.createTextNode(textVal.substring(lastIdx, matchIdx)),
          );
        }

        // Create the highlighted Span container
        const highlightSpan = document.createElement("span");
        highlightSpan.className =
          "scanner-highlight bg-amber-500 text-slate-950 font-bold px-0.5 rounded";
        highlightSpan.textContent = textVal.substring(
          matchIdx,
          matchIdx + searchTerm.length,
        );
        fragment.appendChild(highlightSpan);

        lastIdx = matchIdx + searchTerm.length;
        matchIdx = textLower.indexOf(searchLower, lastIdx);
      }

      // Append remaining text after the final match
      if (lastIdx < textVal.length) {
        fragment.appendChild(
          document.createTextNode(textVal.substring(lastIdx)),
        );
      }

      const parent = node.parentNode;
      if (parent) {
        const firstInsertedNode = fragment.firstChild;
        const insertedNodes = Array.from(fragment.childNodes);

        // Track state parameters so we can safely roll back later
        this.highlights.push({
          parent,
          originalTextNode: node,
          firstInsertedNode,
          insertedNodes,
        });

        // Swap the plain text node with the compiled fragment
        parent.replaceChild(fragment, node);
      }
    }
  }

  /**
   * Restores highlighted nodes back to their original text node coordinates.
   */
  clear() {
    // Traverse backwards to avoid DOM structure hierarchy collapses
    for (let i = this.highlights.length - 1; i >= 0; i--) {
      const h = this.highlights[i];

      // Ensure the parent is still active in the DOM tree
      if (h.parent && h.parent.isConnected) {
        // Place the original un-mutated text node back exactly where the fragment started
        if (h.firstInsertedNode.parentNode === h.parent) {
          h.parent.insertBefore(h.originalTextNode, h.firstInsertedNode);
        }

        // Clean up all highlighted text spans and sibling text pieces
        h.insertedNodes.forEach((child) => {
          if (child.parentNode === h.parent) {
            h.parent.removeChild(child);
          }
        });

        h.parent.normalize(); // Cleanly merge text coordinates back together
      }
    }
    this.highlights = [];
  }
}
