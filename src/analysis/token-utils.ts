/**
 * Token and pool utilities for analyzing Cetus swap data
 * Uses hardcoded mappings for MVP - can be upgraded to API calls later
 */

export interface PoolInfo {
  poolId: string;
  tokenA: string;
  tokenB: string;
  displayName: string;
}

/**
 * Known Cetus pool mappings (hardcoded for MVP)
 * These are the most actively traded pools on Cetus
 */
const KNOWN_POOLS: Record<string, PoolInfo> = {
  '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630': {
    poolId: '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630',
    tokenA: 'SUI',
    tokenB: 'USDC',
    displayName: 'SUI/USDC'
  },
  '0x5b0b24c27ccf6d0e98f3a8704d2e577de83fa574d3a9060eb8945eeb82b3e2df': {
    poolId: '0x5b0b24c27ccf6d0e98f3a8704d2e577de83fa574d3a9060eb8945eeb82b3e2df',
    tokenA: 'CETUS',
    tokenB: 'SUI',
    displayName: 'CETUS/SUI'
  },
  '0x2e041f3fd93646dcc877f783c1f2b7fa62d30271bdef1f21ef002cebf857bded': {
    poolId: '0x2e041f3fd93646dcc877f783c1f2b7fa62d30271bdef1f21ef002cebf857bded',
    tokenA: 'CETUS',
    tokenB: 'SUI',
    displayName: 'CETUS/SUI'
  },
  '0xc8d7a1503dc2f9f5b05449a87d8733593e2f0f3e7bffd90541252782e4d2ca20': {
    poolId: '0xc8d7a1503dc2f9f5b05449a87d8733593e2f0f3e7bffd90541252782e4d2ca20',
    tokenA: 'USDC',
    tokenB: 'USDT',
    displayName: 'USDC/USDT'
  }
};

/**
 * Token decimals for amount normalization
 */
const TOKEN_DECIMALS: Record<string, number> = {
  'SUI': 9,
  'USDC': 6,
  'USDT': 6,
  'CETUS': 9,
};

/**
 * Get pool information by pool ID
 */
export function getPoolInfo(poolId: string): PoolInfo {
  const known = KNOWN_POOLS[poolId];
  if (known) return known;

  // Fallback for unknown pools
  return {
    poolId,
    tokenA: 'TOKEN_A',
    tokenB: 'TOKEN_B',
    displayName: `Pool:${poolId.slice(0, 8)}...`
  };
}

/**
 * Extract token symbols from a pool
 */
export function getTokensFromPool(poolId: string): string[] {
  const poolInfo = getPoolInfo(poolId);
  return [poolInfo.tokenA, poolInfo.tokenB];
}

/**
 * Get display name for a pool
 */
export function getPoolDisplayName(poolId: string): string {
  return getPoolInfo(poolId).displayName;
}

/**
 * Determine which token was bought/sold in a swap
 */
export function getSwapDirection(poolId: string, atob: boolean): { tokenIn: string; tokenOut: string } {
  const poolInfo = getPoolInfo(poolId);

  if (atob) {
    // A to B: selling tokenA, buying tokenB
    return {
      tokenIn: poolInfo.tokenA,
      tokenOut: poolInfo.tokenB
    };
  } else {
    // B to A: selling tokenB, buying tokenA
    return {
      tokenIn: poolInfo.tokenB,
      tokenOut: poolInfo.tokenA
    };
  }
}

/**
 * Normalize token amount to human-readable decimal
 */
export function normalizeTokenAmount(amount: string, tokenSymbol: string): number {
  const decimals = TOKEN_DECIMALS[tokenSymbol] || 9;
  return parseInt(amount) / Math.pow(10, decimals);
}

/**
 * Convert any token amount to SUI equivalent for comparison
 * Uses simplified exchange rates for MVP
 */
export function convertToSuiEquivalent(amount: string, tokenSymbol: string): number {
  const normalizedAmount = normalizeTokenAmount(amount, tokenSymbol);

  // Simplified conversion rates (would be fetched from price APIs in production)
  const CONVERSION_RATES: Record<string, number> = {
    'SUI': 1.0,        // Base token
    'USDC': 1.0,       // Assume 1 USDC ≈ 1 SUI for simplicity
    'USDT': 1.0,       // Assume 1 USDT ≈ 1 SUI for simplicity
    'CETUS': 0.025,    // Assume 1 CETUS ≈ 0.025 SUI
  };

  const rate = CONVERSION_RATES[tokenSymbol] || 1.0;
  return normalizedAmount * rate;
}

/**
 * Analyze what tokens a user trades most
 */
export function analyzeTokenPreferences(poolIds: string[]): Array<{ token: string; count: number; percentage: number }> {
  const tokenCounts: Record<string, number> = {};

  // Count each token appearance
  for (const poolId of poolIds) {
    const tokens = getTokensFromPool(poolId);
    for (const token of tokens) {
      tokenCounts[token] = (tokenCounts[token] || 0) + 1;
    }
  }

  // Convert to sorted array with percentages
  const totalCounts = Object.values(tokenCounts).reduce((sum, count) => sum + count, 0);

  if (totalCounts === 0) return [];

  return Object.entries(tokenCounts)
    .map(([token, count]) => ({
      token,
      count,
      percentage: (count / totalCounts) * 100
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Analyze pool preferences
 */
export function analyzePoolPreferences(poolIds: string[]): Array<{ pool: string; displayName: string; count: number; percentage: number }> {
  const poolCounts: Record<string, number> = {};

  for (const poolId of poolIds) {
    poolCounts[poolId] = (poolCounts[poolId] || 0) + 1;
  }

  const totalCounts = poolIds.length;

  if (totalCounts === 0) return [];

  return Object.entries(poolCounts)
    .map(([poolId, count]) => ({
      pool: poolId,
      displayName: getPoolDisplayName(poolId),
      count,
      percentage: (count / totalCounts) * 100
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Check if a token is considered a "major" token
 */
export function isMajorToken(tokenSymbol: string): boolean {
  const majorTokens = ['SUI', 'USDC', 'USDT'];
  return majorTokens.includes(tokenSymbol);
}

/**
 * Check if a token is a DeFi protocol token
 */
export function isDefiToken(tokenSymbol: string): boolean {
  const defiTokens = ['CETUS'];
  return defiTokens.includes(tokenSymbol);
}

/**
 * Categorize tokens by type
 */
export function categorizeTokens(tokens: string[]): {
  major: string[];
  defi: string[];
  other: string[];
} {
  const major: string[] = [];
  const defi: string[] = [];
  const other: string[] = [];

  for (const token of tokens) {
    if (isMajorToken(token)) {
      major.push(token);
    } else if (isDefiToken(token)) {
      defi.push(token);
    } else {
      other.push(token);
    }
  }

  return { major, defi, other };
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount: string, tokenSymbol: string): string {
  const normalized = normalizeTokenAmount(amount, tokenSymbol);

  if (normalized >= 1e6) {
    return `${(normalized / 1e6).toFixed(2)}M ${tokenSymbol}`;
  } else if (normalized >= 1e3) {
    return `${(normalized / 1e3).toFixed(2)}K ${tokenSymbol}`;
  } else {
    return `${normalized.toFixed(2)} ${tokenSymbol}`;
  }
}

/**
 * Format SUI equivalent for comparison
 */
export function formatSuiEquivalent(amount: string, tokenSymbol: string): string {
  const suiEquiv = convertToSuiEquivalent(amount, tokenSymbol);
  return `${suiEquiv.toFixed(2)} SUI equiv`;
}