export interface ChangedFile {
  filename: string;
  previous_filename?: string;
  status: string;
  patch?: string;
}

export interface Anchor {
  side: 'LEFT' | 'RIGHT';
  line: number;
  changed: boolean;
}

// GitHub's modern review coordinates are source line numbers, not diff positions.
export function parseAnchors(patch: string): Anchor[] {
  const anchors: Anchor[] = [];
  let left = 0;
  let right = 0;
  let remainingLeft = 0;
  let remainingRight = 0;
  for (const text of patch.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(text);
    if (hunk) {
      left = Number(hunk[1]);
      right = Number(hunk[3]);
      remainingLeft = Number(hunk[2] ?? 1);
      remainingRight = Number(hunk[4] ?? 1);
      continue;
    }
    if (text.startsWith('-') && remainingLeft > 0) {
      anchors.push({ side: 'LEFT', line: left++, changed: true });
      remainingLeft--;
    } else if (text.startsWith('+') && remainingRight > 0) {
      anchors.push({ side: 'RIGHT', line: right++, changed: true });
      remainingRight--;
    } else if (
      text.startsWith(' ') &&
      remainingLeft > 0 &&
      remainingRight > 0
    ) {
      anchors.push({ side: 'LEFT', line: left++, changed: false });
      anchors.push({ side: 'RIGHT', line: right++, changed: false });
      remainingLeft--;
      remainingRight--;
    }
    // A "\ No newline at end of file" marker does not consume a source line.
  }
  return anchors;
}

export function hasAnchor(
  files: ChangedFile[],
  path: string | null,
  line: number | null,
  side: Anchor['side'],
) {
  const file = files.find((item) => item.filename === path);
  return Boolean(
    file?.patch &&
    parseAnchors(file.patch).some(
      (anchor) => anchor.line === line && anchor.side === side,
    ),
  );
}

export function isReviewablePath(path: string) {
  if (path.includes('..') || path.includes('\\') || path.startsWith('/')) {
    return false;
  }
  if (/^(src|tests)\/.+\.(ts|tsx|js|css|html|json)$/.test(path)) return true;
  return /^(README\.md|package\.json|tsconfig\.json|vite\.config\.ts|index\.html)$/.test(
    path,
  );
}
