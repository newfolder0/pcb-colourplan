import { describe, expect, it } from 'vitest';
import { atomsAfterTag, childrenWithTag, firstWithTag, isList, num, parseSExpr, str, tag } from './sexpr';

describe('parseSExpr', () => {
  it('parses a simple list with numeric and string atoms', () => {
    const e = parseSExpr('(at 1.5 -2 90)');
    expect(isList(e)).toBe(true);
    expect(e).toEqual(['at', 1.5, -2, 90]);
  });

  it('keeps quoted strings as strings (no numeric coercion)', () => {
    const e = parseSExpr('(property "Value" "100")') as unknown[];
    expect(e[2]).toBe('100');
    expect(typeof e[2]).toBe('string');
  });

  it('coerces bare numeric tokens to numbers', () => {
    const e = parseSExpr('(version 20240108)') as unknown[];
    expect(e[1]).toBe(20240108);
  });

  it('handles escaped quotes and backslashes in strings', () => {
    const e = parseSExpr('(t "a\\"b\\\\c")') as unknown[];
    expect(e[1]).toBe('a"b\\c');
  });

  it('parses nested lists', () => {
    const e = parseSExpr('(a (b 1) (b 2) (c 3))') as never;
    expect(childrenWithTag(e, 'b')).toHaveLength(2);
    expect(num(firstWithTag(e, 'c')?.[1])).toBe(3);
  });

  it('exposes tag and atom accessors', () => {
    const e = parseSExpr('(attr smd dnp)') as never;
    expect(tag(e)).toBe('attr');
    expect(atomsAfterTag(e).map(String)).toEqual(['smd', 'dnp']);
    expect(str(undefined, 'x')).toBe('x');
  });

  it('throws on malformed input', () => {
    expect(() => parseSExpr('(unterminated')).toThrow();
    expect(() => parseSExpr('not a list')).toThrow();
  });
});
