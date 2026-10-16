// The linear model of Holman & Payne (2016) for Planet Nine's signature in the Cassini range
// residuals, evaluated from the six basis signatures exported by tools/export_cassini_data.py.
// For a perturber in direction n with tidal parameter k = M/r^3 (Msun/au^3), the post-fit
// signature is k * sum_b c_b(n) * basis_b, with c_b the entries of T = I - 3 n n^T.

export const DEG = Math.PI / 180;

export function unit(raDeg, decDeg) {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/** Coefficients of T = I - 3 n n^T in the order xx, yy, zz, xy, xz, yz. */
export function tensorCoeffs(n) {
  return [1 - 3 * n[0] * n[0], 1 - 3 * n[1] * n[1], 1 - 3 * n[2] * n[2], -3 * n[0] * n[1], -3 * n[0] * n[2], -3 * n[1] * n[2]];
}

/** Post-fit range signature (metres) at each measurement time. */
export function signature(basis, n, k) {
  const c = tensorCoeffs(n), N = basis[0].length, s = new Float64Array(N);
  for (let b = 0; b < 6; b++) { const cb = c[b] * k, row = basis[b]; for (let i = 0; i < N; i++) s[i] += cb * row[i]; }
  return s;
}

/** Expected rise in chi^2 if a perturber with this signature were absent from the data. */
export function dchi2(s, sigma) {
  let q = 0;
  for (const v of s) q += v * v;
  return q / (sigma * sigma);
}

/** The basis's Gram matrix G_ab = sum_i basis_a[i] basis_b[i], so that sum s^2 = k^2 c^T G c. */
export function gram(basis) {
  const G = Array.from({ length: 6 }, () => new Float64Array(6));
  for (let a = 0; a < 6; a++) for (let b = a; b < 6; b++) {
    let q = 0; const A = basis[a], B = basis[b];
    for (let i = 0; i < A.length; i++) q += A[i] * B[i];
    G[a][b] = G[b][a] = q;
  }
  return G;
}

/** The tidal parameter at which the expected Delta chi^2 reaches `threshold`, towards n. */
export function limit(G, n, sigma, threshold) {
  const c = tensorCoeffs(n);
  let q = 0;
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) q += c[a] * G[a][b] * c[b];
  return Math.sqrt(threshold) * sigma / Math.sqrt(q);
}
