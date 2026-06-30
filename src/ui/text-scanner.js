/**
 * Surgical DOM Text Search and Highlight Engine.
 * Employs native TreeWalker & Range APIs to highlight matches without
 * rebuilding outer HTML, keeping bound event listeners intact.
 */
export class TextScanner {
  /**
   * @param {HTMLElement} rootContainer - The container boundary of the target search area.
   */
  constructor(rootContainer) {
    this.root = rootContainer;
    this.activeHighlights = [];
  }

  /**
   * Clears any active highlight span wraps from the DOM tree, restoring
   * original, unified text nodes to keep layout memory clean.
   */
  clear() {
    this.activeHighlights.forEach((span) => {
      if (span.parentNode) {
        const textNode = document.createTextNode(span.textContent);
        span.parentNode.replaceChild(textNode, span);
        // Normalize recombines split text nodes to keep DOM structure optimal
        if (textNode.parentNode) {
          textNode.parentNode.normalize();
        }
      }
    });
    this.activeHighlights = [];
  }

  /**
   * Traverses all text nodes surgically to apply styled highlight wraps.
   * @param {string} query - The target search term.
   * @param {string} [highlightClass] - Custom CSS class applied to matches.
   */
  highlight(
    query,
    highlightClass = "bg-yellow-500/30 text-yellow-200 rounded-sm px-0.5",
  ) {
    this.clear(); // Reset previous scans first
    if (!query || typeof query !== "string" || !query.trim()) return;

    const normalizedQuery = query.toLowerCase();

    // 1. Traverse raw text nodes directly using native TreeWalker
    const walker = document.createTreeWalker(
      this.root,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );

    const targetNodes = [];
    let currentNode = walker.nextNode();

    while (currentNode) {
      // Exclude text node children belonging to interactive control regions or templates
      const parentTag = currentNode.parentNode?.tagName?.toUpperCase();
      if (
        parentTag !== "SCRIPT" &&
        parentTag !== "STYLE" &&
        parentTag !== "TEXTAREA"
      ) {
        targetNodes.push(currentNode);
      }
      currentNode = walker.nextNode();
    }

    // 2. Search matches across identified text elements
    targetNodes.forEach((node) => {
      const nodeText = node.nodeValue.toLowerCase();
      let matchIdx = nodeText.indexOf(normalizedQuery);

      // Keep looping if text node contains multiple matches
      while (matchIdx !== -1) {
        const range = document.createRange();

        // Target coordinates precisely matching letter boundaries
        range.setStart(node, matchIdx);
        range.setEnd(node, matchIdx + query.length);

        const highlightSpan = document.createElement("span");
        highlightSpan.className = highlightClass;

        try {
          // Wrap only the target letters without rebuilding outer container
          range.surroundContents(highlightSpan);
          this.activeHighlights.push(highlightSpan);
        } catch (err) {
          // Guard boundary if match splits across adjacent element links
          console.warn(
            "Surgical Wrap interrupted across element boundary:",
            err,
          );
        }

        // Re-align walker index targeting the rest of the text block
        const remainingTextNode = highlightSpan.nextSibling;
        if (
          remainingTextNode &&
          remainingTextNode.nodeType === Node.TEXT_NODE
        ) {
          node = remainingTextNode;
          const updatedText = node.nodeValue.toLowerCase();
          matchIdx = updatedText.indexOf(normalizedQuery);
        } else {
          break;
        }
      }
    });
  }
}
