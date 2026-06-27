// Minimal s-expression parser for KiCAD files.
//
// KiCAD `.kicad_pcb` files are a single nested s-expression. A list always
// begins with a symbol tag, e.g. `(at 1.0 2.0 90)`. We represent a list as a
// JS array and atoms as `string | number`. Quoted strings stay strings; bare
// numeric tokens are coerced to numbers (KiCAD only quotes textual values, so
// this never mis-coerces a component value like "100").

export type SExpr = string | number | SExpr[];

/** Parse the root s-expression of a KiCAD file. Throws on malformed input. */
export function parseSExpr(input: string): SExpr {
  const n = input.length;
  let i = 0;

  function skipWs(): void {
    while (i < n) {
      const c = input[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') i++;
      else break;
    }
  }

  function parseList(): SExpr[] {
    i++; // consume '('
    const list: SExpr[] = [];
    for (;;) {
      skipWs();
      if (i >= n) throw new Error('Unexpected end of input inside list');
      const c = input[i];
      if (c === ')') {
        i++;
        return list;
      }
      if (c === '(') list.push(parseList());
      else list.push(parseAtom());
    }
  }

  function parseAtom(): string | number {
    if (input[i] === '"') return parseQuoted();
    const start = i;
    while (i < n) {
      const c = input[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '(' || c === ')' || c === '"') break;
      i++;
    }
    const tok = input.slice(start, i);
    const asNum = toNumber(tok);
    return asNum !== null ? asNum : tok;
  }

  function parseQuoted(): string {
    i++; // consume opening quote
    let out = '';
    while (i < n) {
      const c = input[i++];
      if (c === '\\') {
        const e = input[i++];
        switch (e) {
          case 'n': out += '\n'; break;
          case 't': out += '\t'; break;
          case 'r': out += '\r'; break;
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          default: out += e; // keep unknown escapes verbatim
        }
        continue;
      }
      if (c === '"') return out;
      out += c;
    }
    throw new Error('Unterminated quoted string');
  }

  skipWs();
  if (input[i] !== '(') throw new Error('Expected "(" at start of s-expression');
  return parseList();
}

function toNumber(tok: string): number | null {
  if (tok === '') return null;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(tok)) {
    const v = Number(tok);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

// ---- Accessors -------------------------------------------------------------

export function isList(e: SExpr | undefined): e is SExpr[] {
  return Array.isArray(e);
}

/** The tag (first element) of a list, stringified. */
export function tag(e: SExpr[]): string {
  return typeof e[0] === 'string' ? e[0] : String(e[0]);
}

/** All child lists of a list (skips its tag and atom values). */
export function children(e: SExpr[]): SExpr[][] {
  return e.slice(1).filter(isList) as SExpr[][];
}

export function childrenWithTag(e: SExpr[], t: string): SExpr[][] {
  return children(e).filter((c) => tag(c) === t);
}

export function firstWithTag(e: SExpr[], t: string): SExpr[] | undefined {
  for (const c of children(e)) if (tag(c) === t) return c;
  return undefined;
}

/** The non-list atom values following the tag, e.g. `(attr smd dnp)` -> ['smd','dnp']. */
export function atomsAfterTag(e: SExpr[]): (string | number)[] {
  return e.slice(1).filter((v) => !Array.isArray(v)) as (string | number)[];
}

export function num(v: SExpr | undefined, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}

export function str(v: SExpr | undefined, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return fallback;
}
