// Collapse a list of reference designators into compact ranges for legends,
// e.g. ['C1'..'C10','C16','C17'] -> "C1-C10, C16-C17".

interface ParsedRef {
  prefix: string;
  num: number; // NaN if the ref has no trailing number
  raw: string;
}

function parseRef(raw: string): ParsedRef {
  const m = /^(.*?)(\d+)$/.exec(raw);
  return m ? { prefix: m[1], num: Number(m[2]), raw } : { prefix: raw, num: NaN, raw };
}

export function compressRefs(refs: string[]): string {
  const parsed = refs.map(parseRef).sort((a, b) =>
    a.prefix === b.prefix ? a.num - b.num : a.prefix.localeCompare(b.prefix, undefined, { numeric: true }),
  );

  const out: string[] = [];
  let i = 0;
  while (i < parsed.length) {
    const start = parsed[i];
    if (Number.isNaN(start.num)) {
      out.push(start.raw);
      i++;
      continue;
    }
    let j = i;
    while (
      j + 1 < parsed.length &&
      parsed[j + 1].prefix === start.prefix &&
      !Number.isNaN(parsed[j + 1].num) &&
      parsed[j + 1].num === parsed[j].num + 1
    ) {
      j++;
    }
    out.push(j > i ? `${start.raw}-${parsed[j].raw}` : start.raw);
    i = j + 1;
  }
  return out.join(', ');
}
