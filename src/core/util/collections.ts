/** Natural (human) string comparison: R1 < R2 < R10. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
