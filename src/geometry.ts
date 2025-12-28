/**
 * Geometry utilities for PDF parsing
 */

/**
 * Multiply two transformation matrices
 * Returns the concatenation a*b (apply b, then a).
 */
export function multiplyMatrix(a: number[], b: number[]): number[] {
  // PDF matrices are represented as [a b c d e f] and transform points as:
  // x' = a*x + c*y + e
  // y' = b*x + d*y + f
  
  const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
  const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5];

  return [
    a0 * b0 + a2 * b1,
    a1 * b0 + a3 * b1,
    a0 * b2 + a2 * b3,
    a1 * b2 + a3 * b3,
    a0 * b4 + a2 * b5 + a4,
    a1 * b4 + a3 * b5 + a5
  ];
}

/**
 * Apply a transformation matrix to a point.
 */
export function transformPoint(m: number[], x: number, y: number): { x: number, y: number } {
  const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5];
  return {
    x: a * x + c * y + e,
    y: b * x + d * y + f
  };
}






