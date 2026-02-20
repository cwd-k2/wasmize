/** Plain JS implementations of the 5 algorithm problems. */

export function jsFib(n: number): number {
  const dp = new Array<number>(n + 1);
  dp[0] = 0;
  dp[1] = 1;
  if (n <= 1) return dp[n];
  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
  }
  return dp[n];
}

export function jsHanoi(n: number, from: number, to: number, aux: number): number {
  if (n <= 0) return 0;
  const c1 = jsHanoi(n - 1, from, aux, to);
  const c2 = jsHanoi(n - 1, aux, to, from);
  return c1 + 1 + c2;
}

export function jsKadane(arr: number[]): number {
  let currentSum = arr[0];
  let maxSum = arr[0];
  for (let i = 1; i < arr.length; i++) {
    currentSum = currentSum + arr[i] > arr[i] ? currentSum + arr[i] : arr[i];
    if (currentSum > maxSum) maxSum = currentSum;
  }
  return maxSum;
}

export function jsCoinChange(amount: number, coins: number[]): number {
  const INF = 0x7fffffff;
  const dp = new Int32Array(amount + 1);
  dp.fill(INF);
  dp[0] = 0;
  for (const coin of coins) {
    for (let i = coin; i <= amount; i++) {
      if (dp[i - coin] < INF) {
        const tmp = dp[i - coin] + 1;
        if (tmp < dp[i]) dp[i] = tmp;
      }
    }
  }
  return dp[amount] === INF ? -1 : dp[amount];
}

export function jsBinarySearch(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = ((lo + hi) / 2) | 0;
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export function jsGcd(a: number, b: number): number {
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

export function jsGcdArray(arr: number[]): number {
  let result = arr[0];
  for (let i = 1; i < arr.length; i++) result = jsGcd(result, arr[i]);
  return result;
}

export function jsSieve(n: number): number {
  const flags = new Uint8Array(n + 1);
  flags.fill(1);
  flags[0] = 0;
  flags[1] = 0;
  for (let i = 2; i * i <= n; i++) {
    if (flags[i]) for (let j = i * i; j <= n; j += i) flags[j] = 0;
  }
  let count = 0;
  for (let i = 2; i <= n; i++) if (flags[i]) count++;
  return count;
}

export function jsMatmul(A: number[], B: number[], n: number): number[] {
  const C = new Array(n * n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) C[i * n + j] += A[i * n + k] * B[k * n + j];
  return C;
}

export function jsLcs(a: number[], b: number[]): number {
  const m = a.length,
    n = b.length;
  const dp = new Int32Array((m + 1) * (n + 1));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i * (n + 1) + j] =
        a[i - 1] === b[j - 1]
          ? dp[(i - 1) * (n + 1) + (j - 1)] + 1
          : Math.max(dp[(i - 1) * (n + 1) + j], dp[i * (n + 1) + (j - 1)]);
  return dp[m * (n + 1) + n];
}

export function jsKnapsack(weights: number[], values: number[], cap: number): number {
  const dp = new Int32Array(cap + 1);
  for (let i = 0; i < weights.length; i++)
    for (let w = cap; w >= weights[i]; w--) {
      const nv = dp[w - weights[i]] + values[i];
      if (nv > dp[w]) dp[w] = nv;
    }
  return dp[cap];
}

export function jsQuicksort(arr: number[]): void {
  function partition(lo: number, hi: number): number {
    const pivot = arr[hi];
    let i = lo;
    for (let j = lo; j < hi; j++) {
      if (arr[j] <= pivot) {
        [arr[i], arr[j]] = [arr[j], arr[i]];
        i++;
      }
    }
    [arr[i], arr[hi]] = [arr[hi], arr[i]];
    return i;
  }
  function qs(lo: number, hi: number): void {
    if (lo < hi) {
      const p = partition(lo, hi);
      qs(lo, p - 1);
      qs(p + 1, hi);
    }
  }
  qs(0, arr.length - 1);
}

export function jsFloodFill(
  grid: number[],
  W: number,
  H: number,
  sx: number,
  sy: number,
  target: number,
  fill: number,
): number {
  if (grid[sy * W + sx] !== target) return 0;
  const queue: [number, number][] = [[sx, sy]];
  grid[sy * W + sx] = fill;
  let count = 1;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx,
        ny = cy + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny * W + nx] === target) {
        grid[ny * W + nx] = fill;
        queue.push([nx, ny]);
        count++;
      }
    }
  }
  return count;
}

export function jsLis(arr: number[]): number {
  const tails: number[] = [];
  for (const x of arr) {
    let lo = 0,
      hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}

export function jsNqueens(n: number): number {
  function solve(row: number, cols: number, d1: number, d2: number): number {
    if (row >= n) return 1;
    let count = 0;
    for (let col = 0; col < n; col++) {
      const bit = 1 << col;
      const d1bit = 1 << (row + col);
      const d2bit = 1 << (row - col + n - 1);
      if (!(cols & bit) && !(d1 & d1bit) && !(d2 & d2bit))
        count += solve(row + 1, cols | bit, d1 | d1bit, d2 | d2bit);
    }
    return count;
  }
  return solve(0, 0, 0, 0);
}

export function jsDijkstra(
  weights: number[],
  w: number,
  h: number,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): number {
  const INF = 0x7fffffff;
  const n = w * h;
  const dist = new Int32Array(n).fill(INF);

  // Priority queue as sorted array of [distance, index]
  const pq: [number, number][] = [];
  const startIdx = sy * w + sx;
  dist[startIdx] = weights[startIdx];
  pq.push([weights[startIdx], startIdx]);

  const dx = [1, -1, 0, 0];
  const dy = [0, 0, 1, -1];

  while (pq.length > 0) {
    const [curDist, ci] = pq.shift()!;
    if (curDist > dist[ci]) continue;

    const cx = ci % w;
    const cy = (ci - cx) / w;
    if (cx === gx && cy === gy) return curDist;

    for (let d = 0; d < 4; d++) {
      const nx = cx + dx[d];
      const ny = cy + dy[d];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const ni = ny * w + nx;
        const newDist = curDist + weights[ni];
        if (newDist < dist[ni]) {
          dist[ni] = newDist;
          // Insert maintaining sorted order
          let lo = 0, hi = pq.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (pq[mid][0] < newDist) lo = mid + 1;
            else hi = mid;
          }
          pq.splice(lo, 0, [newDist, ni]);
        }
      }
    }
  }

  return -1;
}

export class JsUnionFind {
  parent: number[];
  rank: number[];
  count: number;
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
    this.count = n;
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(u: number, v: number): void {
    const ru = this.find(u),
      rv = this.find(v);
    if (ru === rv) return;
    if (this.rank[ru] < this.rank[rv]) this.parent[ru] = rv;
    else if (this.rank[ru] > this.rank[rv]) this.parent[rv] = ru;
    else {
      this.parent[rv] = ru;
      this.rank[ru]++;
    }
    this.count--;
  }
}
