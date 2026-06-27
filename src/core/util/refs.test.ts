import { describe, expect, it } from 'vitest';
import { compressRefs } from './refs';

describe('compressRefs', () => {
  it('collapses consecutive runs into ranges', () => {
    const refs = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C16', 'C17'];
    expect(compressRefs(refs)).toBe('C1-C10, C16-C17');
  });

  it('handles mixed prefixes and isolated refs', () => {
    expect(compressRefs(['B1', 'B2', 'B3', 'B4', 'FTG2', 'FTG3', 'FTG6'])).toBe('B1-B4, FTG2-FTG3, FTG6');
  });

  it('keeps single refs as-is', () => {
    expect(compressRefs(['R5'])).toBe('R5');
    expect(compressRefs(['R1', 'R3', 'R5'])).toBe('R1, R3, R5');
  });

  it('is order-independent', () => {
    expect(compressRefs(['C3', 'C1', 'C2'])).toBe('C1-C3');
  });
});
