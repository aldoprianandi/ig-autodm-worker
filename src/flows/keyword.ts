const MAX_FUZZY_PHRASE_TOKENS = 6;

export function commentMatchesKeyword(commentText: string, keyword: string): boolean {
  const keywordTokens = tokenize(keyword);
  if (!keywordTokens.length) return false;

  const commentTokens = tokenize(commentText);
  if (!commentTokens.length) return false;

  if (containsExactTokenSequence(commentTokens, keywordTokens)) return true;

  if (keywordTokens.length === 1) {
    return commentTokens.some((token) => tokensMatch(token, keywordTokens[0]));
  }

  if (keywordTokens.length > MAX_FUZZY_PHRASE_TOKENS) return false;
  return phraseTokensMatch(keywordTokens, commentTokens);
}

function containsExactTokenSequence(commentTokens: string[], keywordTokens: string[]): boolean {
  if (keywordTokens.length > commentTokens.length) return false;

  for (let start = 0; start <= commentTokens.length - keywordTokens.length; start += 1) {
    if (keywordTokens.every((token, offset) => commentTokens[start + offset] === token)) return true;
  }

  return false;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function phraseTokensMatch(keywordTokens: string[], commentTokens: string[]): boolean {
  // Match each keyword to a distinct comment token using augmenting paths.
  // Backtracking over every assignment can explode on repetitive comments.
  const candidates = keywordTokens.map((keywordToken) =>
    commentTokens.flatMap((commentToken, index) => tokensMatch(commentToken, keywordToken) ? [index] : [])
  );
  if (candidates.some((matches) => matches.length === 0)) return false;
  const owner = new Map<number, number>();

  function assign(keywordIndex: number, visited: Set<number>): boolean {
    for (const commentIndex of candidates[keywordIndex]) {
      if (visited.has(commentIndex)) continue;
      visited.add(commentIndex);
      const previousOwner = owner.get(commentIndex);
      if (previousOwner === undefined || assign(previousOwner, visited)) {
        owner.set(commentIndex, keywordIndex);
        return true;
      }
    }
    return false;
  }

  return keywordTokens.every((_, index) => assign(index, new Set<number>()));
}

function tokensMatch(commentToken: string, keywordToken: string): boolean {
  if (commentToken === keywordToken) return true;
  const distance = allowedDistance(keywordToken);
  if (distance === 0) return false;
  if (commentToken.length > keywordToken.length + 1) return false;
  if (Math.abs(commentToken.length - keywordToken.length) > distance) return false;
  return damerauLevenshtein(commentToken, keywordToken, distance) <= distance;
}

function allowedDistance(keywordToken: string): number {
  const length = keywordToken.length;
  if (length <= 2) return 0;
  if (length <= 4) return 1;
  if (length <= 7) return 2;
  return 2;
}

function damerauLevenshtein(a: string, b: string, maxDistance: number): number {
  let previousPrevious = new Array<number>(b.length + 1).fill(0);
  let previous = new Array<number>(b.length + 1).fill(0).map((_, index) => index);
  let current = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );

      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        current[j] = Math.min(current[j], previousPrevious[j - 2] + 1);
      }

      rowMin = Math.min(rowMin, current[j]);
    }

    if (rowMin > maxDistance) return rowMin;
    [previousPrevious, previous, current] = [previous, current, previousPrevious];
  }

  return previous[b.length];
}
