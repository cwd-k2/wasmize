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

export function jsHanoi(
  n: number,
  from: number,
  to: number,
  aux: number,
  onMove: (from: number, to: number) => void,
): number {
  if (n <= 0) return 0;
  const c1 = jsHanoi(n - 1, from, aux, to, onMove);
  onMove(from, to);
  const c2 = jsHanoi(n - 1, aux, to, from, onMove);
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
    const mid = (lo + hi) / 2 | 0;
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
