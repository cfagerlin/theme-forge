// Maps character offsets (as returned by @shopify/liquid-html-parser Position.start)
// to {line, column} for citations in decision reports.
//
// Build once per file. Binary-search line lookups are O(log n); the overhead of
// scanning for newlines once is amortized across many citations per file.

export function buildLineMap(source) {
  // Offsets of each line's first character. Line 1 starts at offset 0.
  // Line N starts at the character after the (N-1)th '\n'.
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) {
      lineStarts.push(i + 1);
    }
  }
  return {
    lineStarts,
    lineAt(offset) {
      // Binary search for the largest lineStart <= offset.
      let lo = 0;
      let hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (lineStarts[mid] <= offset) lo = mid;
        else hi = mid - 1;
      }
      return {
        line: lo + 1,
        column: offset - lineStarts[lo] + 1,
      };
    },
  };
}
