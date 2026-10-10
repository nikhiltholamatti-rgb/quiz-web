/**
 * Generic Fisher-Yates shuffle on an array copy
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
export function fisherYatesShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Normalizes options into standard items with original letters:
 * [{ originalLetter: 'A', text: 'Option text' }, { originalLetter: 'B', text: 'Option text' }, ...]
 * then shuffles them using Fisher-Yates.
 *
 * Reads directly from option_a, option_b, option_c, option_d as well as other common shapes.
 * This guarantees that whichever slot the user taps, the returned answer
 * is the TRUE original letter (A/B/C/D) that matches the server answer key.
 *
 * @param {any} rawOptions
 * @returns {Array<{ originalLetter: string, text: string }>}
 */
export function prepareShuffledOptions(rawOptions) {
  const standardized = [];

  if (rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)) {
    // 1. Direct support for Supabase columns: option_a, option_b, option_c, option_d
    if (
      rawOptions.option_a !== undefined ||
      rawOptions.option_b !== undefined ||
      rawOptions.option_c !== undefined ||
      rawOptions.option_d !== undefined
    ) {
      if (rawOptions.option_a !== undefined) standardized.push({ originalLetter: 'A', text: String(rawOptions.option_a) });
      if (rawOptions.option_b !== undefined) standardized.push({ originalLetter: 'B', text: String(rawOptions.option_b) });
      if (rawOptions.option_c !== undefined) standardized.push({ originalLetter: 'C', text: String(rawOptions.option_c) });
      if (rawOptions.option_d !== undefined) standardized.push({ originalLetter: 'D', text: String(rawOptions.option_d) });
    }
    // 2. Direct support for A, B, C, D keys
    else {
      const letters = ['A', 'B', 'C', 'D'];
      for (const letter of letters) {
        const val = rawOptions[letter] ?? rawOptions[letter.toLowerCase()];
        if (val !== undefined) {
          standardized.push({
            originalLetter: letter,
            text: String(val),
          });
        }
      }
      // Fallback for custom keys
      if (standardized.length === 0) {
        Object.keys(rawOptions).forEach((k, idx) => {
          standardized.push({
            originalLetter: letters[idx] || k,
            text: String(rawOptions[k]),
          });
        });
      }
    }
  } else if (Array.isArray(rawOptions)) {
    const letters = ['A', 'B', 'C', 'D'];
    rawOptions.forEach((opt, idx) => {
      const defaultLetter = letters[idx] || String.fromCharCode(65 + idx);
      if (typeof opt === 'string') {
        standardized.push({
          originalLetter: defaultLetter,
          text: opt,
        });
      } else if (opt && typeof opt === 'object') {
        standardized.push({
          originalLetter: opt.letter || opt.key || defaultLetter,
          text: opt.text || opt.label || opt.value || String(opt),
        });
      }
    });
  }

  // Fallback safety if empty or invalid
  if (standardized.length === 0) {
    return [
      { originalLetter: 'A', text: 'Option A' },
      { originalLetter: 'B', text: 'Option B' },
      { originalLetter: 'C', text: 'Option C' },
      { originalLetter: 'D', text: 'Option D' },
    ];
  }

  // Shuffle using Fisher-Yates
  return fisherYatesShuffle(standardized);
}
