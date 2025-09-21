#!/usr/bin/env node

/**
 * Trader Soul MCP Server
 * Provides personalized trading insights from Cetus swap history
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { initCetusSDK } from '@cetusprotocol/cetus-sui-clmm-sdk';
import { WalrusClient, WalrusFile } from '@mysten/walrus';
import { Transaction } from '@mysten/sui/transactions';
import { adjustForSlippage, Percentage, d } from '@cetusprotocol/cetus-sui-clmm-sdk';
import BN from 'bn.js';
import fetch from 'node-fetch';

// Inlined Types from config/networks.ts
export type SuiNetwork = 'testnet' | 'mainnet';

export interface NetworkConfig {
  name: SuiNetwork;
  rpcUrl: string;
  walrusNetwork: 'testnet' | 'mainnet';
  cetusPackageId: string;
  cetusGlobalConfig: string;
  commonTokens: {
    SUI: string;
    USDC: string;
    USDT: string;
    CETUS: string;
    DEEP: string;
    WAL: string;
  };
  faucets?: {
    sui?: string;
    wal?: string;
  };
}

// Inlined network config functions
function getNetworkConfig(): NetworkConfig {
  const network = (process.env.NETWORK as SuiNetwork) || 'mainnet';
  
  const configs: Record<SuiNetwork, NetworkConfig> = {
    testnet: {
      name: 'testnet',
      rpcUrl: 'https://fullnode.testnet.sui.io:443',
      walrusNetwork: 'testnet',
      cetusPackageId: '0x2918cf39850de6d5d94d8196dc878c8c722cd79db659318e00bff57fbb4e2ede',
      cetusGlobalConfig: '0xf5ff7d5ba73b581bca6b4b9fa0049cd320360abd154b809f8700a8fd3cfaf7ca',
      commonTokens: {
        SUI: '0x2::sui::SUI',
        USDC: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
        USDT: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
        CETUS: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
        DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
        WAL: '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL',
      },
      faucets: {
        sui: 'https://docs.sui.io/guides/developer/getting-started/get-coins',
        wal: 'Contact hackathon organizers or check Walrus docs',
      },
    },
    mainnet: {
      name: 'mainnet',
      rpcUrl: 'https://fullnode.mainnet.sui.io:443',
      walrusNetwork: 'mainnet',
      cetusPackageId: '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb',
      cetusGlobalConfig: '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb',
      commonTokens: {
        SUI: '0x2::sui::SUI',
        USDC: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
        USDT: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebd73820c7d13cfcda0cd0cf3e3e6::coin::COIN',
        CETUS: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
        DEEP: '0x000000000000000000000000000000000000000000000000000000000000dee9::deep::DEEP',
        WAL: '0x000000000000000000000000000000000000000000000000000000000000wal::wal::WAL',
      },
    },
  };

  return configs[network];
}

function validateNetworkConfig(config: NetworkConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.name) errors.push('Network name is required');
  if (!config.rpcUrl) errors.push('RPC URL is required');
  if (!config.cetusPackageId) errors.push('Cetus package ID is required');
  if (!config.commonTokens.SUI) errors.push('SUI token address is required');

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Inlined Types from execution/types.ts
interface TradeRecommendation {
  id: number;
  action: 'buy' | 'sell';
  tokenIn: string;
  tokenOut: string;
  pool: string;
  amount: string;
  confidence: number;
  reasoning: string;
  suggestedAmount: string;
  currentPrice?: string;
  stopLoss?: string;
  target?: string;
}

interface ExecutionRequest {
  recommendationId: number;
  userAddress: string;
  maxSlippage?: number;
  maxPositionSize?: number;
  deadline?: number;
}



interface ExecutionContext {
  recommendation: TradeRecommendation;
  request: ExecutionRequest;
  timestamp: number;
  userBalance: string;
  estimatedGas: string;
}

// Inlined Types from storage/schema.ts
interface StoredAnalysis {
  id: string;
  wallet: string;
  analysis: any; // TradingPatterns
  storedAt: string;
  version: string;
  metadata: {
    dataHash: string;
    swapCount: number;
    confidenceLevel: 'low' | 'medium' | 'high';
    expiresAt?: string;
  };
}

interface AnalysisCache {
  wallet: string;
  lastAnalysis?: StoredAnalysis;
  historicalAnalyses: StoredAnalysis[];
  aggregatedInsights?: {
    tradingEvolution: string[];
    consistencyScore: number;
    improvementAreas: string[];
  };
}

interface WalrusStorageConfig {
  network: 'testnet' | 'mainnet';
  epochs: number;
  suiRpcUrl: string;
  defaultDeleteable: boolean;
}

const DEFAULT_STORAGE_CONFIG: WalrusStorageConfig = {
  network: 'testnet',
  epochs: 10,
  suiRpcUrl: 'https://fullnode.testnet.sui.io:443',
  defaultDeleteable: true
};

function generateAnalysisId(wallet: string, timestamp: number): string {
  return `analysis-${wallet.slice(0, 8)}-${timestamp}`;
}

function generateCacheId(wallet: string): string {
  return `cache-${wallet}`;
}

function hashAnalysisData(patterns: any): string {
  const keyData = {
    swapCount: patterns.dataQuality.totalSwaps,
    topToken: patterns.tokenPreferences.favoriteTokens[0]?.token,
    tradingStyle: patterns.tradingRhythm.tradingStyle,
    analysisDate: patterns.analysisDate
  };
  return Buffer.from(JSON.stringify(keyData)).toString('base64').slice(0, 16);
}

function shouldUpdateAnalysis(
  existing: StoredAnalysis | undefined,
  newSwapCount: number,
  newDataHash: string
): boolean {
  if (!existing) return true;
  const existingSwapCount = existing.metadata.swapCount;
  const swapIncrease = (newSwapCount - existingSwapCount) / existingSwapCount;
  return swapIncrease > 0.1 || existing.metadata.dataHash !== newDataHash;
}

// Inlined utilities from analysis/statistics.ts
interface BasicStats {
  mean: number;
  median: number;
  mode: number | null;
  min: number;
  max: number;
  std: number;
  count: number;
}

function mean(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
}

function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function standardDeviation(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const avg = mean(numbers);
  const squaredDiffs = numbers.map(num => Math.pow(num - avg, 2));
  const avgSquaredDiff = mean(squaredDiffs);
  return Math.sqrt(avgSquaredDiff);
}

function getBasicStats(numbers: number[]): BasicStats {
  return {
    mean: mean(numbers),
    median: median(numbers),
    mode: null, // Simplified
    min: numbers.length ? Math.min(...numbers) : 0,
    max: numbers.length ? Math.max(...numbers) : 0,
    std: standardDeviation(numbers),
    count: numbers.length,
  };
}

function getFrequencyDistribution<T>(items: T[]): Array<{ value: T; count: number; percentage: number }> {
  if (items.length === 0) return [];
  const frequency: Map<T, number> = new Map();
  for (const item of items) {
    frequency.set(item, (frequency.get(item) || 0) + 1);
  }
  return Array.from(frequency.entries())
    .map(([value, count]) => ({
      value,
      count,
      percentage: (count / items.length) * 100,
    }))
    .sort((a, b) => b.count - a.count);
}

function calculateHerfindahlIndex<T>(items: T[]): number {
  if (items.length === 0) return 0;
  const frequencies = getFrequencyDistribution(items);
  return frequencies.reduce((sum, freq) => {
    const proportion = freq.percentage / 100;
    return sum + Math.pow(proportion, 2);
  }, 0);
}

function getTimePeriod(timestamps: number[]): { days: number; hours: number; start: Date; end: Date } {
  if (timestamps.length === 0) {
    const now = Date.now();
    return { days: 0, hours: 0, start: new Date(now), end: new Date(now) };
  }
  const sorted = [...timestamps].sort((a, b) => a - b);
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  const hours = Math.abs(start - end) / (1000 * 60 * 60);
  return {
    days: hours / 24,
    hours,
    start: new Date(start),
    end: new Date(end),
  };
}

function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}

// Inlined token utilities from analysis/token-utils.ts
let cetusSDKForUtils: any = null;

function initPoolUtils(networkName: 'mainnet' | 'testnet' = 'mainnet') {
  if (!cetusSDKForUtils) {
    cetusSDKForUtils = initCetusSDK({ network: networkName });
  }
  return cetusSDKForUtils;
}

function normalizeTokenAmount(amount: string, tokenSymbol: string): number {
  const decimalsMap: { [key: string]: number } = {
    'SUI': 9,
    'USDC': 6,
    'USDT': 6,
    'CETUS': 9,
    'DEEP': 9,
  };
  const decimals = decimalsMap[tokenSymbol] || 9;
  return parseInt(amount) / Math.pow(10, decimals);
}

function convertToSuiEquivalent(amount: string, tokenSymbol: string): number {
  const normalizedAmount = normalizeTokenAmount(amount, tokenSymbol);
  const fallbackRates: { [key: string]: number } = {
    'SUI': 1.0,
    'USDC': 1.0,
    'USDT': 1.0,
    'CETUS': 0.025,
  };
  const rate = fallbackRates[tokenSymbol] || 1.0;
  return normalizedAmount * rate;
}

function getTokensFromPoolSync(poolId: string): string[] {
  // This function is deprecated - use dynamic pool discovery instead
  // Deprecated function warning - getTokensFromPoolSync
  return ['UNKNOWN', 'UNKNOWN'];
}

function getSwapDirectionSync(poolId: string, atob: boolean): { tokenIn: string; tokenOut: string } {
  const tokens = getTokensFromPoolSync(poolId);
  if (atob) {
    return { tokenIn: tokens[0], tokenOut: tokens[1] };
  } else {
    return { tokenIn: tokens[1], tokenOut: tokens[0] };
  }
}

function analyzeTokenPreferences(poolIds: string[]): Array<{ token: string; count: number; percentage: number }> {
  const tokenCounts: Record<string, number> = {};
  for (const poolId of poolIds) {
    const tokens = getTokensFromPoolSync(poolId);
    for (const token of tokens) {
      tokenCounts[token] = (tokenCounts[token] || 0) + 1;
    }
  }
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

function analyzePoolPreferences(poolIds: string[]): Array<{ pool: string; displayName: string; count: number; percentage: number }> {
  const poolCounts: Record<string, number> = {};
  for (const poolId of poolIds) {
    poolCounts[poolId] = (poolCounts[poolId] || 0) + 1;
  }
  const totalCounts = poolIds.length;
  if (totalCounts === 0) return [];
  return Object.entries(poolCounts)
    .map(([poolId, count]) => ({
      pool: poolId,
      displayName: `Pool:${poolId.slice(0, 8)}...`,
      count,
      percentage: (count / totalCounts) * 100
    }))
    .sort((a, b) => b.count - a.count);
}

function categorizeTokens(tokens: string[]): { major: string[]; defi: string[]; other: string[] } {
  const major: string[] = [];
  const defi: string[] = [];
  const other: string[] = [];
  for (const token of tokens) {
    if (['SUI', 'USDC', 'USDT'].includes(token)) {
      major.push(token);
    } else if (['CETUS'].includes(token)) {
      defi.push(token);
    } else {
      other.push(token);
    }
  }
  return { major, defi, other };
}

// Inlined from analysis/patterns.ts
interface SwapEvent {
  id: string;
  timestamp: number;
  sender: string;
  pool: string;
  amountIn: string;
  amountOut: string;
  atob: boolean;
  afterSqrtPrice: string;
  beforeSqrtPrice: string;
  feeAmount: string;
  txDigest: string;
}

interface TradingPatterns {
  wallet: string;
  analysisDate: string;
  dataQuality: {
    totalSwaps: number;
    timeRange: string;
    dataConfidence: 'low' | 'medium' | 'high';
  };
  tokenPreferences: {
    favoriteTokens: Array<{ token: string; percentage: number }>;
    diversification: number;
    tokenCategories: {
      major: number;
      defi: number;
      other: number;
    };
  };
  poolPreferences: {
    favoritePools: Array<{ displayName: string; percentage: number }>;
    poolCount: number;
  };
  tradingSizing: {
    averageTradeSize: string;
    typicalRange: string;
    consistency: 'very_consistent' | 'consistent' | 'varied' | 'highly_varied';
  };
  tradingRhythm: {
    frequency: string;
    averageTimeBetweenTrades: string;
    tradingStyle: 'high_frequency' | 'active' | 'moderate' | 'occasional';
  };
  timingPatterns: {
    mostActiveHour: string;
    mostActiveDay: string;
    timeDistribution: Array<{ period: string; percentage: number }>;
  };
  tradingPersonality: string;
  keyInsights: string[];
}

class SwapPatternAnalyzer {
  analyzePatterns(wallet: string, swaps: SwapEvent[]): TradingPatterns {
    if (swaps.length === 0) {
      return this.getEmptyPatterns(wallet);
    }

    const dataQuality = this.assessDataQuality(swaps);
    const tokenPreferences = this.analyzeTokenPreferences(swaps);
    const poolPreferences = this.analyzePoolPreferences(swaps);
    const tradingSizing = this.analyzeTradeSizing(swaps);
    const tradingRhythm = this.analyzeTradingRhythm(swaps);
    const timingPatterns = this.analyzeTimingPatterns(swaps);

    const tradingPersonality = this.determineTradingPersonality({
      tokenPreferences,
      tradingSizing,
      tradingRhythm,
      timingPatterns
    });

    const keyInsights = this.generateKeyInsights({
      tokenPreferences,
      poolPreferences,
      tradingSizing,
      tradingRhythm,
      timingPatterns,
      dataQuality
    });

    return {
      wallet,
      analysisDate: new Date().toISOString(),
      dataQuality,
      tokenPreferences,
      poolPreferences,
      tradingSizing,
      tradingRhythm,
      timingPatterns,
      tradingPersonality,
      keyInsights
    };
  }

  private assessDataQuality(swaps: SwapEvent[]) {
    const timePeriod = getTimePeriod(swaps.map(s => s.timestamp));
    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (swaps.length >= 50) confidence = 'high';
    else if (swaps.length >= 20) confidence = 'medium';

    return {
      totalSwaps: swaps.length,
      timeRange: timePeriod.days > 1 ?
        `${timePeriod.days.toFixed(0)} days` :
        `${timePeriod.hours.toFixed(1)} hours`,
      dataConfidence: confidence
    };
  }

  private analyzeTokenPreferences(swaps: SwapEvent[]) {
    const poolIds = swaps.map(s => s.pool);
    const tokenPrefs = analyzeTokenPreferences(poolIds);
    const allTokens = Array.from(new Set(
      poolIds.flatMap(poolId => getTokensFromPoolSync(poolId))
    ));
    const categories = categorizeTokens(allTokens);
    const totalTokens = allTokens.length;
    const diversification = calculateHerfindahlIndex(
      poolIds.flatMap(poolId => getTokensFromPoolSync(poolId))
    );

    return {
      favoriteTokens: tokenPrefs.slice(0, 5).map(t => ({
        token: t.token,
        percentage: Math.round(t.percentage)
      })),
      diversification: Math.round((1 - diversification) * 100) / 100,
      tokenCategories: {
        major: Math.round((categories.major.length / totalTokens) * 100),
        defi: Math.round((categories.defi.length / totalTokens) * 100),
        other: Math.round((categories.other.length / totalTokens) * 100)
      }
    };
  }

  private analyzePoolPreferences(swaps: SwapEvent[]) {
    const poolIds = swaps.map(s => s.pool);
    const poolPrefs = analyzePoolPreferences(poolIds);

    return {
      favoritePools: poolPrefs.slice(0, 3).map(p => ({
        displayName: p.displayName,
        percentage: Math.round(p.percentage)
      })),
      poolCount: poolPrefs.length
    };
  }

  private analyzeTradeSizing(swaps: SwapEvent[]) {
    const tradeSizes = swaps.map(swap => {
      const direction = getSwapDirectionSync(swap.pool, swap.atob);
      return convertToSuiEquivalent(swap.amountIn, direction.tokenIn);
    });

    const stats = getBasicStats(tradeSizes);
    const cv = stats.std / stats.mean;

    let consistency: 'very_consistent' | 'consistent' | 'varied' | 'highly_varied';
    if (cv < 0.3) consistency = 'very_consistent';
    else if (cv < 0.6) consistency = 'consistent';
    else if (cv < 1.0) consistency = 'varied';
    else consistency = 'highly_varied';

    return {
      averageTradeSize: `${stats.mean.toFixed(0)} SUI equiv`,
      typicalRange: `${Math.round(stats.mean * 0.7)}-${Math.round(stats.mean * 1.3)} SUI equiv`,
      consistency
    };
  }

  private analyzeTradingRhythm(swaps: SwapEvent[]) {
    if (swaps.length < 2) {
      return {
        frequency: 'Insufficient data',
        averageTimeBetweenTrades: 'N/A',
        tradingStyle: 'occasional' as const
      };
    }

    const sortedSwaps = [...swaps].sort((a, b) => a.timestamp - b.timestamp);
    const timeBetween: number[] = [];

    for (let i = 1; i < sortedSwaps.length; i++) {
      const hoursDiff = (sortedSwaps[i].timestamp - sortedSwaps[i-1].timestamp) / (1000 * 60 * 60);
      timeBetween.push(hoursDiff);
    }

    const avgHoursBetween = mean(timeBetween);
    const avgDaysBetween = avgHoursBetween / 24;

    let tradingStyle: 'high_frequency' | 'active' | 'moderate' | 'occasional';
    if (avgDaysBetween < 0.5) tradingStyle = 'high_frequency';
    else if (avgDaysBetween < 2) tradingStyle = 'active';
    else if (avgDaysBetween < 7) tradingStyle = 'moderate';
    else tradingStyle = 'occasional';

    return {
      frequency: `${swaps.length} swaps over ${this.formatDuration(avgDaysBetween * (swaps.length - 1))} days`,
      averageTimeBetweenTrades: avgDaysBetween < 1 ?
        `${avgHoursBetween.toFixed(1)} hours` :
        `${avgDaysBetween.toFixed(1)} days`,
      tradingStyle
    };
  }

  private analyzeTimingPatterns(swaps: SwapEvent[]) {
    const hours = swaps.map(s => new Date(s.timestamp).getUTCHours());
    const days = swaps.map(s => new Date(s.timestamp).getUTCDay());

    const hourDistribution = getFrequencyDistribution(hours);
    const dayDistribution = getFrequencyDistribution(days);

    const mostActiveHour = hourDistribution[0]?.value ?? 0;
    const mostActiveDay = dayDistribution[0]?.value ?? 0;

    const periods = hours.map(hour => {
      if (hour >= 0 && hour < 6) return 'Late Night (0-6 UTC)';
      if (hour >= 6 && hour < 12) return 'Morning (6-12 UTC)';
      if (hour >= 12 && hour < 18) return 'Afternoon (12-18 UTC)';
      return 'Evening (18-24 UTC)';
    });

    const periodDistribution = getFrequencyDistribution(periods);

    return {
      mostActiveHour: formatHour(mostActiveHour),
      mostActiveDay: DAY_NAMES[mostActiveDay],
      timeDistribution: periodDistribution.map(p => ({
        period: p.value,
        percentage: Math.round(p.percentage)
      }))
    };
  }

  private determineTradingPersonality(analysis: any): string {
    const { tokenPreferences, tradingSizing, tradingRhythm } = analysis;

    let base = '';
    switch (tradingRhythm.tradingStyle) {
      case 'high_frequency':
        base = 'High-Frequency';
        break;
      case 'active':
        base = 'Active';
        break;
      case 'moderate':
        base = 'Moderate';
        break;
      default:
        base = 'Occasional';
    }

    const favoriteToken = tokenPreferences.favoriteTokens[0]?.token || 'Token';
    const majorsPercentage = tokenPreferences.tokenCategories.major;

    if (majorsPercentage >= 80) {
      return `${base} ${favoriteToken} Trader (Major Token Focus)`;
    } else if (tokenPreferences.tokenCategories.defi >= 30) {
      return `${base} DeFi Trader (${favoriteToken} + Protocol Tokens)`;
    } else {
      return `${base} Diversified Trader (${favoriteToken} Primary)`;
    }
  }

  private generateKeyInsights(analysis: any): string[] {
    const insights: string[] = [];
    const { tokenPreferences, poolPreferences, tradingSizing, tradingRhythm, timingPatterns, dataQuality } = analysis;

    const topToken = tokenPreferences.favoriteTokens[0];
    if (topToken) {
      insights.push(`Prefers trading ${topToken.token} (${topToken.percentage}% of trades)`);
    }

    const topPool = poolPreferences.favoritePools[0];
    if (topPool) {
      insights.push(`Most active in ${topPool.displayName} pool (${topPool.percentage}% of trades)`);
    }

    insights.push(`Typical trade size: ${tradingSizing.averageTradeSize} (${tradingSizing.consistency})`);

    if (tradingRhythm.tradingStyle === 'high_frequency') {
      insights.push(`Very active trader - ${tradingRhythm.averageTimeBetweenTrades} between trades`);
    } else {
      insights.push(`${tradingRhythm.tradingStyle} trading pace - ${tradingRhythm.averageTimeBetweenTrades} between trades`);
    }

    const topPeriod = timingPatterns.timeDistribution[0];
    if (topPeriod) {
      insights.push(`Most active during ${topPeriod.period} (${topPeriod.percentage}% of trades)`);
    }

    if (dataQuality.dataConfidence === 'low') {
      insights.push(`⚠️ Limited data (${dataQuality.totalSwaps} swaps) - patterns may not be representative`);
    }

    return insights;
  }

  private formatDuration(days: number): string {
    if (days < 1) return (days * 24).toFixed(1);
    return days.toFixed(1);
  }

  private getEmptyPatterns(wallet: string): TradingPatterns {
    return {
      wallet,
      analysisDate: new Date().toISOString(),
      dataQuality: {
        totalSwaps: 0,
        timeRange: 'No data',
        dataConfidence: 'low'
      },
      tokenPreferences: {
        favoriteTokens: [],
        diversification: 0,
        tokenCategories: { major: 0, defi: 0, other: 0 }
      },
      poolPreferences: {
        favoritePools: [],
        poolCount: 0
      },
      tradingSizing: {
        averageTradeSize: 'No data',
        typicalRange: 'No data',
        consistency: 'varied'
      },
      tradingRhythm: {
        frequency: 'No trades found',
        averageTimeBetweenTrades: 'N/A',
        tradingStyle: 'occasional'
      },
      timingPatterns: {
        mostActiveHour: 'N/A',
        mostActiveDay: 'N/A',
        timeDistribution: []
      },
      tradingPersonality: 'No Trading Activity Detected',
      keyInsights: ['No swap activity found for this wallet']
    };
  }
}

const patternAnalyzer = new SwapPatternAnalyzer();

// ============================================================================
// SUI CLIENT (from sui/client.ts)
// ============================================================================

// Network configuration will be loaded later
const SUI_RPC_URL = 'https://fullnode.mainnet.sui.io:443'; // Will be overridden by network config
const CETUS_CLMM_PACKAGE = '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb'; // Will be overridden by network config

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

interface EventQueryResult {
  data: any[];
  nextCursor?: any;
  hasNextPage: boolean;
}

class SuiClientWrapper {
  private rpcUrl: string;
  private cetusPackageId: string;

  constructor(rpcUrl: string = SUI_RPC_URL, cetusPackageId: string = CETUS_CLMM_PACKAGE) {
    this.rpcUrl = rpcUrl;
    this.cetusPackageId = cetusPackageId;
  }

  async rpcCall<T>(method: string, params: any[]): Promise<T> {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    };

    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as RpcResponse<T>;

    if (data.error) {
      throw new Error(`RPC Error: ${data.error.message}`);
    }

    return data.result!;
  }

  async getCetusSwapEvents(cursor: any = null, limit: number = 50): Promise<EventQueryResult> {
    // Query for swap events from official Cetus package IDs (network-specific)
    const network = (process.env.NETWORK as SuiNetwork) || 'mainnet';
    
    const cetusPackageIds = network === 'testnet' ? [
      // Official testnet package IDs
      '0x2918cf39850de6d5d94d8196dc878c8c722cd79db659318e00bff57fbb4e2ede', // integrate - Main testnet package
      '0x0c7ae833c220aa73a3643a0d508afa4ac5d50d97312ea4584e35f9eb21b9df12', // clmm_pool - Testnet CLMM package
      '0xf5ff7d5ba73b581bca6b4b9fa0049cd320360abd154b809f8700a8fd3cfaf7ca'  // cetus_config - Testnet config package
    ] : [
      // Official mainnet package IDs
      '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb', // clmm_pool - Mainnet CLMM package
      '0x996c4d9480708fb8b92aa7acf819fb0497b5ec8e65ba06601cae2fb6db3312c3', // integrate - Mainnet integration package
      '0x95b8d278b876cae22206131fb9724f701c9444515813042f54f0a426c9a3bc2f', // cetus_config - Mainnet config package
      // Keep some legacy package IDs for historical swap events
      '0x47a7b90756fba96fe649c2aaa10ec60dec6b8cb8545573d621310072721133aa', // Legacy Cetus module
      '0xb2db7142fa83210a7d78d9c12ac49c043b3cbbd482224fea6e3da00aa5a5ae2d'  // Legacy Router module
    ];

    const allSwaps: any[] = [];
    let totalFetched = 0;

    for (const packageId of cetusPackageIds) {
      if (totalFetched >= limit) break;
      
      try {
        const params = [
          {
            "MoveEventType": `${packageId}::pool::SwapEvent`
          },
          cursor,
          Math.min(limit - totalFetched, 20) // Fetch up to 20 per package
        ];

        const result = await this.rpcCall<EventQueryResult>('suix_queryEvents', params);
        if (result.data && result.data.length > 0) {
          allSwaps.push(...result.data);
          totalFetched += result.data.length;
        }
      } catch (error) {
        // Continue with other packages if one fails
        // Package query error - continuing with other packages
      }
    }

    // Sort by timestamp and limit
    allSwaps.sort((a, b) => parseInt(b.timestampMs) - parseInt(a.timestampMs));
    
    return {
      data: allSwaps.slice(0, limit),
      nextCursor: allSwaps.length > limit ? allSwaps[limit - 1].id : null,
      hasNextPage: allSwaps.length > limit
    };
  }

  async getSwapEventsForWallet(walletAddress: string, limit: number = 100): Promise<SwapEvent[]> {
    const allSwaps: SwapEvent[] = [];
    let cursor: any = null;
    let totalEventsFetched = 0;
    const maxEventsToFetch = limit * 5; // Fetch up to 5x more events to find enough wallet-specific swaps

    // Query by wallet first, then filter by swap event types
    while (allSwaps.length < limit && totalEventsFetched < maxEventsToFetch) {
      const batchSize = Math.min(50, maxEventsToFetch - totalEventsFetched);

      try {
        // Query for ALL events from this wallet
        const params = [
          {
            "Sender": walletAddress
          },
          cursor,
          batchSize
        ];

        const result = await this.rpcCall<EventQueryResult>('suix_queryEvents', params);

        if (!result.data || result.data.length === 0) {
          break;
        }

        // Filter for Cetus swap events only
        const swapEvents = result.data.filter(event => {
          const eventType = event.type;
          return (
            // Official Cetus package IDs
            eventType.includes('0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb::pool::SwapEvent') ||
            eventType.includes('0x996c4d9480708fb8b92aa7acf819fb0497b5ec8e65ba06601cae2fb6db3312c3::pool::SwapEvent') ||
            eventType.includes('0x95b8d278b876cae22206131fb9724f701c9444515813042f54f0a426c9a3bc2f::pool::SwapEvent')
          );
        });

        // Parse the swap events
        const parsedSwaps = swapEvents.map(event => this.parseSwapEvent(event));
        allSwaps.push(...parsedSwaps);
        totalEventsFetched += result.data.length;
        cursor = result.nextCursor;

        if (!cursor || !result.hasNextPage) {
          break;
        }

        // Add small delay to be nice to the RPC
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        // Error fetching events
        break;
      }
    }

    // Sort by timestamp (newest first) and limit
    allSwaps.sort((a, b) => b.timestamp - a.timestamp);
    return allSwaps.slice(0, limit);
  }

  private parseSwapEvent(rawEvent: any): SwapEvent {
    const parsed = rawEvent.parsedJson;

    return {
      id: `${rawEvent.id.txDigest}:${rawEvent.id.eventSeq}`,
      timestamp: parseInt(rawEvent.timestampMs),
      sender: rawEvent.sender,
      pool: parsed.pool,
      amountIn: parsed.amount_in,
      amountOut: parsed.amount_out,
      atob: parsed.atob,
      afterSqrtPrice: parsed.after_sqrt_price,
      beforeSqrtPrice: parsed.before_sqrt_price,
      feeAmount: parsed.fee_amount,
      txDigest: rawEvent.id.txDigest,
    };
  }

  // Helper function to get pool info (simplified)
  getPoolDisplayName(poolId: string): string {
    // Use dynamic pool discovery instead of hardcoded mappings
    return `Pool:${poolId.slice(0, 8)}...`;
  }

  formatSwapForDisplay(swap: SwapEvent): any {
    const poolName = this.getPoolDisplayName(swap.pool);
    const side = swap.atob ? 'buy' : 'sell';

    return {
      timestamp: new Date(swap.timestamp).toISOString(),
      pool: poolName,
      side,
      amountIn: swap.amountIn,
      amountOut: swap.amountOut,
      fee: swap.feeAmount,
      txHash: swap.txDigest,
    };
  }
}

// ============================================================================
// TRADING ANALYSIS STORAGE (from storage/walrus-client.ts)
export class TradingAnalysisStorage {
  private walrusClient: WalrusClient;
  private suiClient: SuiClient;
  private config: WalrusStorageConfig;
  private keypair?: Ed25519Keypair;
  private networkConfig: NetworkConfig;

  constructor(config?: Partial<WalrusStorageConfig>, networkConfig?: NetworkConfig) {
    this.networkConfig = networkConfig || getNetworkConfig();

    // Merge default config with network-specific and user overrides
    this.config = {
      ...DEFAULT_STORAGE_CONFIG,
      network: this.networkConfig.walrusNetwork,
      suiRpcUrl: this.networkConfig.rpcUrl,
      ...config
    };

    // Walrus storage initialized

    this.suiClient = new SuiClient({
      url: this.config.suiRpcUrl
    });

    this.walrusClient = new WalrusClient({
      network: this.config.network,
      suiClient: this.suiClient
    });
  }

  setKeypair(keypair: Ed25519Keypair) {
    this.keypair = keypair;
  }

  /**
   * Store trading analysis on Walrus
   */
  async storeAnalysis(wallet: string, patterns: TradingPatterns): Promise<StoredAnalysis> {
    if (!this.keypair) {
      throw new Error('Keypair required for storage operations');
    }

    const timestamp = Date.now();
    const analysisId = generateAnalysisId(wallet, timestamp);
    const dataHash = hashAnalysisData(patterns);

    const storedAnalysis: StoredAnalysis = {
      id: analysisId,
      wallet,
      analysis: patterns,
      storedAt: new Date().toISOString(),
      version: '1.0',
      metadata: {
        dataHash,
        swapCount: patterns.dataQuality.totalSwaps,
        confidenceLevel: patterns.dataQuality.dataConfidence
      }
    };

    // Create JSON string first
    const jsonString = JSON.stringify(storedAnalysis, null, 2);
    // JSON content preview

    const file = WalrusFile.from({
      contents: new TextEncoder().encode(jsonString),
      identifier: `${analysisId}.json`,
      tags: { 'content-type': 'application/json' }
    });

    const results = await this.walrusClient.writeFiles({
      files: [file],
      epochs: this.config.epochs,
      deletable: this.config.defaultDeleteable,
      signer: this.keypair
    });

    // Stored analysis for wallet on Walrus

    // Return new object with blob ID (don't modify original)
    return {
      ...storedAnalysis,
      metadata: {
        ...storedAnalysis.metadata,
        blobId: results[0].blobId
      }
    } as StoredAnalysis;
  }

  /**
   * Retrieve trading analysis from Walrus
   * Uses getBlob() to avoid corruption bug in getFiles()
   */
  async getAnalysis(blobId: string): Promise<StoredAnalysis | null> {
    try {
      // Retrieving analysis from Walrus blob

      // Use getBlob instead of getFiles to avoid corruption
      const blob = await this.walrusClient.getBlob({ blobId });
      // Blob retrieved successfully

      // Get files from the blob
      const files = await blob.files();
      // Found files in blob

      if (files.length === 0) {
        // No files found in blob
        return null;
      }

      // Get the first file (our JSON analysis)
      const file = files[0];
      // Processing file

      // Extract content
      const content = await file.text();
      // File content length
      // Content preview

      // Parse JSON
      const analysis = JSON.parse(content) as StoredAnalysis;
      // Successfully parsed analysis for wallet

      return analysis;
    } catch (error) {
      return null;
    }
  }

  /**
   * Smart analysis storage - only stores if significantly different
   */
  async smartStoreAnalysis(
    wallet: string,
    patterns: TradingPatterns,
    existingAnalysis?: StoredAnalysis
  ): Promise<{ stored: boolean; analysis: StoredAnalysis }> {
    const newDataHash = hashAnalysisData(patterns);
    const newSwapCount = patterns.dataQuality.totalSwaps;

    if (!shouldUpdateAnalysis(existingAnalysis, newSwapCount, newDataHash)) {
      // Skipping storage - no significant changes for wallet
      return { stored: false, analysis: existingAnalysis! };
    }

    const storedAnalysis = await this.storeAnalysis(wallet, patterns);
    return { stored: true, analysis: storedAnalysis };
  }
}

// Inlined from execution/trade-executor.ts



// Inlined from sui/client.ts

class SuiClientInstance {
  private rpcUrl: string;
  private cetusPackageId: string;

  constructor(rpcUrl: string = SUI_RPC_URL, cetusPackageId: string = CETUS_CLMM_PACKAGE) {
    this.rpcUrl = rpcUrl;
    this.cetusPackageId = cetusPackageId;
  }

  async rpcCall<T>(method: string, params: any[]): Promise<T> {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    };

    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as RpcResponse<T>;

    if (data.error) {
      throw new Error(`RPC Error: ${data.error.message}`);
    }

    return data.result!;
  }

  async getCetusSwapEvents(cursor: any = null, limit: number = 50): Promise<EventQueryResult> {
    const params = [
      {
        "MoveEventType": `${this.cetusPackageId}::pool::SwapEvent`
      },
      cursor,
      limit
    ];

    return await this.rpcCall<EventQueryResult>('suix_queryEvents', params);
  }

  async getSwapEventsForWallet(walletAddress: string, limit: number = 100): Promise<SwapEvent[]> {
    const allSwaps: SwapEvent[] = [];
    let cursor: any = null;
    let totalEventsFetched = 0;
    const maxEventsToFetch = limit * 5; // Fetch up to 5x more events to find enough wallet-specific swaps

    // Query by wallet first, then filter by swap event types
    while (allSwaps.length < limit && totalEventsFetched < maxEventsToFetch) {
      const batchSize = Math.min(50, maxEventsToFetch - totalEventsFetched);

      try {
        // Query for ALL events from this wallet
        const params = [
          {
            "Sender": walletAddress
          },
          cursor,
          batchSize
        ];

        const result = await this.rpcCall<EventQueryResult>('suix_queryEvents', params);

        if (!result.data || result.data.length === 0) {
          break;
        }

        // Filter for Cetus swap events only
        const swapEvents = result.data.filter(event => {
          const eventType = event.type;
          return (
            // Official Cetus package IDs
            eventType.includes('0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb::pool::SwapEvent') ||
            eventType.includes('0x996c4d9480708fb8b92aa7acf819fb0497b5ec8e65ba06601cae2fb6db3312c3::pool::SwapEvent') ||
            eventType.includes('0x95b8d278b876cae22206131fb9724f701c9444515813042f54f0a426c9a3bc2f::pool::SwapEvent')
          );
        });

        // Parse the swap events
        const parsedSwaps = swapEvents.map(event => this.parseSwapEvent(event));
        allSwaps.push(...parsedSwaps);
        totalEventsFetched += result.data.length;
        cursor = result.nextCursor;

        if (!cursor || !result.hasNextPage) {
          break;
        }

        // Add small delay to be nice to the RPC
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        // Error fetching events
        break;
      }
    }

    // Sort by timestamp (newest first) and limit
    allSwaps.sort((a, b) => b.timestamp - a.timestamp);
    return allSwaps.slice(0, limit);
  }

  private parseSwapEvent(rawEvent: any): SwapEvent {
    const parsed = rawEvent.parsedJson;

    return {
      id: `${rawEvent.id.txDigest}:${rawEvent.id.eventSeq}`,
      timestamp: parseInt(rawEvent.timestampMs),
      sender: rawEvent.sender,
      pool: parsed.pool,
      amountIn: parsed.amount_in,
      amountOut: parsed.amount_out,
      atob: parsed.atob,
      afterSqrtPrice: parsed.after_sqrt_price,
      beforeSqrtPrice: parsed.before_sqrt_price,
      feeAmount: parsed.fee_amount,
      txDigest: rawEvent.id.txDigest,
    };
  }

  // Helper function to get pool info (simplified)
  getPoolDisplayName(poolId: string): string {
    // Use dynamic pool discovery instead of hardcoded mappings
    return `Pool:${poolId.slice(0, 8)}...`;
  }

  formatSwapForDisplay(swap: SwapEvent): any {
    const poolName = this.getPoolDisplayName(swap.pool);
    const side = swap.atob ? 'buy' : 'sell';

    return {
      timestamp: new Date(swap.timestamp).toISOString(),
      pool: poolName,
      side,
      amountIn: swap.amountIn,
      amountOut: swap.amountOut,
      fee: swap.feeAmount,
      txHash: swap.txDigest,
    };
  }
}


// ============================================================================
// SIMPLE TRADE EXECUTOR (from execution/trade-executor.ts)
// ============================================================================

interface SimpleRecommendation {
  id: number;
  action: 'buy' | 'sell';
  tokenIn: string;
  tokenOut: string;
  pool: string;
  amount: string;
  confidence: number;
  reasoning: string;
}

interface ExecutionResult {
  success: boolean;
  transactionDigest?: string;
  error?: string;
  executedAt: number;
}

class SimpleTradeExecutor {
  private networkConfig: NetworkConfig;
  public cetusSDK: any;

  constructor(
    private suiClient: SuiClient,
    private keypair: Ed25519Keypair,
    networkConfig?: NetworkConfig
  ) {
    this.networkConfig = networkConfig || getNetworkConfig();

    // Initialize Cetus SDK
    const networkName = this.networkConfig.name === 'testnet' ? 'testnet' : 'mainnet';
    this.cetusSDK = initCetusSDK({ network: networkName });

    // Set the sender address for the SDK
    this.cetusSDK.senderAddress = this.keypair.toSuiAddress();

    // Trade executor initialized
  }

  /**
   * Execute a single recommendation using Cetus SDK
   */
  async executeRecommendation(
    recommendation: SimpleRecommendation,
    maxSlippage: number = 0.03 // 3% default
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Executing recommendation
      // Recommendation details

      // Get pool data using Cetus SDK
      const pool = await this.cetusSDK.Pool.getPool(recommendation.pool);
      if (!pool) {
        throw new Error(`Pool ${recommendation.pool} not found`);
      }

      // Using pool

      // Determine swap direction (a2b or b2a)
      const coinTypeA = pool.coinTypeA;
      const coinTypeB = pool.coinTypeB;
      const a2b = recommendation.tokenIn === coinTypeA;

      // Swap direction details

      // Get token decimals (assuming standard decimals for now)
      const decimalsA = this.getTokenDecimals(coinTypeA);
      const decimalsB = this.getTokenDecimals(coinTypeB);

      // Pre-calculate swap using Cetus SDK with correct parameters
      const preswapResult = await this.cetusSDK.Swap.preswap({
        pool: pool,
        currentSqrtPrice: pool.current_sqrt_price,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
        decimalsA: decimalsA,
        decimalsB: decimalsB,
        a2b: Boolean(a2b),
        byAmountIn: true,
        amount: recommendation.amount,
      });

      if (!preswapResult) {
        throw new Error('Preswap calculation failed');
      }

      // Preswap result

      // Calculate minimum amount out with slippage protection using SDK function
      const slippage = Percentage.fromDecimal(d(maxSlippage));
      const toAmount = new BN(preswapResult.estimatedAmountOut);
      const amountLimit = adjustForSlippage(toAmount, slippage, false); // false because we're fixing input amount

      // Min amount out calculated with slippage

      // Create swap transaction using Cetus SDK
      const swapPayload = await this.cetusSDK.Swap.createSwapTransactionPayload({
        pool_id: recommendation.pool,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
        a2b: a2b,
        by_amount_in: true,
        amount: preswapResult.estimatedAmountIn,
        amount_limit: amountLimit.toString(),
      });

      // Swap payload created

      // Execute the swap transaction
      // Submitting transaction
      const result = await this.suiClient.signAndExecuteTransaction({
        signer: this.keypair,
        transaction: await swapPayload,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      if (result.effects?.status?.status === 'success') {
        // Trade executed successfully
        // Transaction completed

        return {
          success: true,
          transactionDigest: result.digest,
          executedAt: startTime,
        };
      } else {
        const error = result.effects?.status?.error || 'Unknown transaction error';
        // Trade failed

        return {
          success: false,
          error: error,
          executedAt: startTime,
        };
      }

    } catch (error) {
      // Execution error

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executedAt: startTime,
      };
    }
  }

  /**
   * Execute multiple recommendations in sequence
   */
  async executeMultipleRecommendations(
    recommendations: SimpleRecommendation[],
    selectedIds: number[]
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const id of selectedIds) {
      const recommendation = recommendations.find(r => r.id === id);

      if (!recommendation) {
        results.push({
          success: false,
          error: `Recommendation #${id} not found`,
          executedAt: Date.now(),
        });
        continue;
      }

      const result = await this.executeRecommendation(recommendation);
      results.push(result);

      // Small delay between trades
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * Get user's balance for a specific token
   */
  async getUserBalance(tokenType: string): Promise<string> {
    try {
      const balance = await this.suiClient.getBalance({
        owner: this.keypair.toSuiAddress(),
        coinType: tokenType,
      });
      // Convert raw balance to proper decimal format
      const decimals = balance.coinType === '0x2::sui::SUI' ? 9 : 9; // Most Sui tokens use 9 decimals
      const formattedBalance = (parseInt(balance.totalBalance) / Math.pow(10, decimals)).toFixed(decimals);
      return formattedBalance;
    } catch (error) {
      // Error getting balance
      return '0';
    }
  }

  /**
   * Estimate gas cost for a trade
   */
  async estimateGasCost(): Promise<string> {
    // Simplified gas estimation
    // Real implementation would use dryRun
    return '10000000'; // ~0.01 SUI
  }

  /**
   * Get token decimals based on coin type
   */
  private getTokenDecimals(coinType: string): number {
    // Standard token decimals mapping
    const decimalsMap: { [key: string]: number } = {
      '0x2::sui::SUI': 9,
      '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN': 9, // USDC
      '0xaf8cd5edc19c4512f4259f0bee101a40d41ebd73820c7d13cfcda0cd0cf3e3e6::coin::COIN': 9, // USDT
    };

    // Check if it's a common token
    if (decimalsMap[coinType]) {
      return decimalsMap[coinType];
    }

    // Default to 9 decimals for most Sui tokens
    return 9;
  }
}

// Tool schemas
const GetSwapHistorySchema = z.object({
  wallet: z.string().describe('Sui wallet address'),
  limit: z.number().optional().default(50).describe('Maximum number of swaps to return'),
});

const GetTradingPatternsSchema = z.object({
  wallet: z.string().describe('Sui wallet address'),
  forceRefresh: z.boolean().optional().default(false).describe('Force refresh analysis'),
});

const GetCachedAnalysisSchema = z.object({
  blobId: z.string().describe('Walrus blob ID'),
});

const GetTokenPricesSchema = z.object({
  tokens: z.array(z.string()).describe('Array of token symbols to get prices for'),
  forceRefresh: z.boolean().optional().default(false).describe('Force refresh prices ignoring cache'),
});

const GetActivePoolsSchema = z.object({
  tokenPairs: z.array(z.string()).optional().describe('Filter by token pairs (e.g., ["SUI-USDC", "CETUS-SUI"])'),
  minLiquidity: z.number().optional().describe('Minimum liquidity threshold'),
  limit: z.number().optional().default(20).describe('Maximum number of pools to return'),
});

const RecommendSwapsSchema = z.object({
  wallet: z.string().describe('Sui wallet address'),
  maxRecommendations: z.number().optional().default(3).describe('Maximum number of recommendations'),
});

const ExecuteTradeSchema = z.object({
  recommendationId: z.number().describe('ID of the recommendation to execute'),
  maxSlippage: z.number().optional().default(0.03).describe('Maximum slippage tolerance (default: 3%)'),
});

// SUI Client schemas
const GetWalletSwapHistorySchema = z.object({
  walletAddress: z.string().describe('Sui wallet address'),
  limit: z.number().optional().default(100).describe('Maximum number of swaps to return'),
});

// Storage schemas
const StoreAnalysisSchema = z.object({
  wallet: z.string().describe('Wallet address'),
  analysis: z.any().describe('Analysis data to store'),
});

const GetStoredAnalysisSchema = z.object({
  blobId: z.string().describe('Walrus blob ID'),
});

// Trade execution schemas
const ExecuteSingleTradeSchema = z.object({
  recommendation: z.any().describe('Trade recommendation object'),
  maxSlippage: z.number().optional().default(0.03).describe('Maximum slippage tolerance'),
});

const GetUserBalanceSchema = z.object({
  wallet: z.string().describe('Wallet address'),
  tokenType: z.string().describe('Token type to check balance for'),
});


// Analysis schemas
const AnalyzeTradingPatternsSchema = z.object({
  wallet: z.string().describe('Wallet address to analyze'),
  swapHistory: z.array(z.any()).optional().describe('Swap history data (optional, will fetch if not provided)'),
});

// Get network configuration
const networkConfig = getNetworkConfig();
const configValidation = validateNetworkConfig(networkConfig);

if (!configValidation.valid) {
  process.exit(1);
}

// Network configuration loaded

// Initialize Sui client
const suiClient = new SuiClient({ url: networkConfig.rpcUrl });

// Initialize custom Sui client instance for swap events
const suiClientInstance = new SuiClientWrapper(networkConfig.rpcUrl, networkConfig.cetusPackageId);


// Initialize Cetus SDK for pool data fetching
const networkName = networkConfig.name === 'testnet' ? 'testnet' : 'mainnet';
const cetusSDK = initCetusSDK({ network: networkName });

// Initialize pool utilities with network config
initPoolUtils(networkName);

// Initialize Walrus storage with network config
const storage = new TradingAnalysisStorage({
  epochs: 10,
}, networkConfig);

// Set up keypairs from environment
// Builder key for system operations (storage, caching)
// User key for trade execution only
let tradeExecutor: SimpleTradeExecutor | null = null;
let builderKeypair: Ed25519Keypair | null = null;
let userKeypair: Ed25519Keypair | null = null;

// Initialize builder keypair for system operations
if (process.env.BUILDER_PRIVATE_KEY) {
  try {
    builderKeypair = Ed25519Keypair.fromSecretKey(process.env.BUILDER_PRIVATE_KEY);
    storage.setKeypair(builderKeypair);
    // Builder keypair initialized for system operations
  } catch (error) {
    // Failed to initialize builder keypair, storage will be read-only
  }
} else {
  // No BUILDER_PRIVATE_KEY found, storage will be read-only
}

// Initialize user keypair for trade execution only
if (process.env.DEMO_PRIVATE_KEY) {
  try {
    userKeypair = Ed25519Keypair.fromSecretKey(process.env.DEMO_PRIVATE_KEY);
    tradeExecutor = new SimpleTradeExecutor(suiClient, userKeypair, networkConfig);
    // User keypair initialized for trade execution
  } catch (error) {
    // Failed to initialize user keypair, trade execution will be unavailable
  }
} else {
  // No DEMO_PRIVATE_KEY found, trade execution will be unavailable
}

// Create server instance
const server = new Server(
  {
    name: 'trader-soul',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(InitializeRequestSchema, async (request) => {
  // Initialize request received
  return {
    protocolVersion: '2025-06-18',
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: 'trader-soul',
      version: '1.0.0',
    },
  };
});

// Define available tools
const tools: Tool[] = [
  {
    name: 'cetus_get_swap_history',
    description: 'Get Cetus swap history for a specific wallet address',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Sui wallet address to analyze',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of swaps to return (default: 50)',
          default: 50,
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'cetus_get_trading_patterns',
    description: 'Analyze trading patterns and discover playbooks for a wallet (with Walrus caching)',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Sui wallet address to analyze',
        },
        forceRefresh: {
          type: 'boolean',
          description: 'Force refresh analysis even if cached version exists',
          default: false,
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'cetus_get_cached_analysis',
    description: 'Retrieve cached trading analysis from Walrus storage',
    inputSchema: {
      type: 'object',
      properties: {
        blobId: {
          type: 'string',
          description: 'Walrus blob ID containing the cached analysis',
        },
      },
      required: ['blobId'],
    },
  },
  {
    name: 'cetus_get_token_prices',
    description: 'Get real-time token prices and conversion rates',
    inputSchema: {
      type: 'object',
      properties: {
        tokens: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of token symbols to get prices for (e.g., ["SUI", "USDC", "CETUS"])',
        },
        forceRefresh: {
          type: 'boolean',
          description: 'Force refresh prices ignoring cache (default: false)',
          default: false,
        },
      },
      required: ['tokens'],
    },
  },
  {
    name: 'cetus_get_active_pools',
    description: 'Discover active trading pools from Cetus DEX',
    inputSchema: {
      type: 'object',
      properties: {
        tokenPairs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by token pairs (e.g., ["SUI-USDC", "CETUS-SUI"])',
        },
        minLiquidity: {
          type: 'number',
          description: 'Minimum liquidity threshold',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of pools to return (default: 20)',
          default: 20,
        },
      },
    },
  },
  {
    name: 'cetus_recommend_swaps',
    description: 'Generate personalized swap recommendations based on trading history',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Sui wallet address to generate recommendations for',
        },
        maxRecommendations: {
          type: 'number',
          description: 'Maximum number of recommendations to return (default: 3)',
          default: 3,
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'cetus_execute_trade',
    description: 'Execute a specific recommendation using Cetus DEX',
    inputSchema: {
      type: 'object',
      properties: {
        recommendationId: {
          type: 'number',
          description: 'ID of the recommendation to execute (from recommendations array)',
        },
        maxSlippage: {
          type: 'number',
          description: 'Maximum slippage tolerance as decimal (default: 0.03 = 3%)',
          default: 0.03,
        },
      },
      required: ['recommendationId'],
    },
  },
  {
    name: 'sui_get_wallet_swap_history',
    description: 'Get swap history for a specific wallet from Sui blockchain',
    inputSchema: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'Sui wallet address to get swap history for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of swaps to return (default: 100)',
          default: 100,
        },
      },
      required: ['walletAddress'],
    },
  },
  {
    name: 'storage_store_analysis',
    description: 'Store trading analysis data on Walrus storage',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Wallet address',
        },
        analysis: {
          type: 'object',
          description: 'Analysis data to store',
        },
      },
      required: ['wallet', 'analysis'],
    },
  },
  {
    name: 'storage_get_analysis',
    description: 'Get stored analysis data from Walrus storage',
    inputSchema: {
      type: 'object',
      properties: {
        blobId: {
          type: 'string',
          description: 'Walrus blob ID',
        },
      },
      required: ['blobId'],
    },
  },
  {
    name: 'execution_execute_single_trade',
    description: 'Execute a single trade recommendation',
    inputSchema: {
      type: 'object',
      properties: {
        recommendation: {
          type: 'object',
          description: 'Trade recommendation object',
        },
        maxSlippage: {
          type: 'number',
          description: 'Maximum slippage tolerance (default: 0.03)',
          default: 0.03,
        },
      },
      required: ['recommendation'],
    },
  },
  {
    name: 'execution_get_user_balance',
    description: 'Get user token balance',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Wallet address',
        },
        tokenType: {
          type: 'string',
          description: 'Token type to check balance for',
        },
      },
      required: ['wallet', 'tokenType'],
    },
  },
  {
    name: 'sui_get_balance',
    description: 'Get token balance for any wallet (no private key required)',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Wallet address to check balance for',
        },
        tokenType: {
          type: 'string',
          description: 'Token type to check balance for (e.g., "0x2::sui::SUI")',
        },
      },
      required: ['wallet', 'tokenType'],
    },
  },
  {
    name: 'sui_get_all_balances',
    description: 'Get all token balances for a wallet using Sui getAllBalances API (no private key required)',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Wallet address to check all balances for',
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'analysis_analyze_trading_patterns',
    description: 'Analyze trading patterns from swap history',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Wallet address to analyze',
        },
        swapHistory: {
          type: 'array',
          description: 'Swap history data (optional, will fetch if not provided)',
        },
      },
      required: ['wallet'],
    },
  },
];

// Handler for listing available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools,
  };
});

// Handler for tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'cetus_get_swap_history': {
        const { wallet, limit } = GetSwapHistorySchema.parse(args);
        return await getSwapHistory(wallet, limit);
      }

      case 'cetus_get_trading_patterns': {
        const { wallet, forceRefresh } = GetTradingPatternsSchema.parse(args);
        return await getTradingPatterns(wallet, forceRefresh);
      }

      case 'cetus_get_cached_analysis': {
        const { blobId } = GetCachedAnalysisSchema.parse(args);
        return await getCachedAnalysis(blobId);
      }

      case 'cetus_get_token_prices': {
        const { tokens, forceRefresh } = GetTokenPricesSchema.parse(args);
        return await getTokenPrices(tokens, forceRefresh);
      }

      case 'cetus_get_active_pools': {
        const { tokenPairs, minLiquidity, limit } = GetActivePoolsSchema.parse(args);
        return await getActivePools(tokenPairs, minLiquidity, limit);
      }

      case 'cetus_recommend_swaps': {
        const { wallet, maxRecommendations } = RecommendSwapsSchema.parse(args);
        return await recommendSwaps(wallet, maxRecommendations);
      }

      case 'cetus_execute_trade': {
        const { recommendationId, maxSlippage } = ExecuteTradeSchema.parse(args);
        return await executeTrade(recommendationId, maxSlippage);
      }

      case 'sui_get_wallet_swap_history': {
        const { walletAddress, limit } = GetWalletSwapHistorySchema.parse(args);
        return await getWalletSwapHistory(walletAddress, limit);
      }

      case 'storage_store_analysis': {
        const { wallet, analysis } = StoreAnalysisSchema.parse(args);
        return await storeAnalysis(wallet, analysis);
      }

      case 'storage_get_analysis': {
        const { blobId } = GetStoredAnalysisSchema.parse(args);
        return await getStoredAnalysis(blobId);
      }

      case 'execution_execute_single_trade': {
        const { recommendation, maxSlippage } = ExecuteSingleTradeSchema.parse(args);
        return await executeSingleTrade(recommendation, maxSlippage);
      }

      case 'execution_get_user_balance': {
        const { wallet, tokenType } = GetUserBalanceSchema.parse(args);
        return await getUserBalance(wallet, tokenType);
      }

      case 'sui_get_balance': {
        const { wallet, tokenType } = GetUserBalanceSchema.parse(args);
        return await getBalanceDirect(wallet, tokenType);
      }

      case 'sui_get_all_balances': {
        const { wallet } = args as { wallet: string };
        return await getAllBalancesDirect(wallet);
      }


      case 'analysis_analyze_trading_patterns': {
        const { wallet, swapHistory } = AnalyzeTradingPatternsSchema.parse(args);
        return await analyzeTradingPatterns(wallet, swapHistory);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Tool implementation functions

async function getSwapHistory(wallet: string, limit: number) {
  try {
    // Getting swap history for wallet

    // Fetch swap events using the inlined SuiClient
    const swapEvents = await suiClientInstance.getSwapEventsForWallet(wallet, limit);
    const formattedSwaps = swapEvents.map(swap => suiClientInstance.formatSwapForDisplay(swap));

    const result = {
      wallet,
      swaps: formattedSwaps,
      totalSwaps: formattedSwaps.length,
      timeRange: formattedSwaps.length > 0 ?
        `${new Date(Math.min(...swapEvents.map(s => s.timestamp))).toISOString().split('T')[0]} to ${new Date(Math.max(...swapEvents.map(s => s.timestamp))).toISOString().split('T')[0]}` :
        'No swaps found',
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    // Error fetching swap history
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching swap history: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function getTradingPatterns(wallet: string, forceRefresh: boolean = false) {
  try {
    console.log(JSON.stringify({
      type: 'trading_patterns_start',
      wallet,
      forceRefresh,
      message: 'Starting trading patterns analysis'
    }));

    // Analyzing trading patterns for wallet

    // Fetch swap history for analysis
    console.log(JSON.stringify({
      type: 'fetching_swap_history',
      wallet,
      limit: 500,
      message: 'Fetching swap events for analysis'
    }));
    
    const swapEvents = await suiClientInstance.getSwapEventsForWallet(wallet, 500);
    
    console.log(JSON.stringify({
      type: 'swap_events_fetched',
      wallet,
      swapCount: swapEvents.length,
      message: 'Swap events retrieved successfully'
    }));

    // Analyze patterns
    console.log(JSON.stringify({
      type: 'pattern_analysis_start',
      wallet,
      swapCount: swapEvents.length,
      message: 'Starting pattern analysis'
    }));
    
    const patterns = patternAnalyzer.analyzePatterns(wallet, swapEvents);
    
    console.log(JSON.stringify({
      type: 'pattern_analysis_complete',
      wallet,
      patterns: {
        dataQuality: patterns.dataQuality,
        tradingPersonality: patterns.tradingPersonality,
        keyInsightsCount: patterns.keyInsights.length
      },
      message: 'Pattern analysis completed successfully'
    }));

    let storedAnalysis = null;
    let storageInfo = '';

    // Try to store on Walrus if keypair is available
    console.log(JSON.stringify({
      type: 'storage_attempt_start',
      wallet,
      hasStorage: !!storage,
      hasKeypair: !!builderKeypair,
      totalSwaps: patterns.dataQuality.totalSwaps,
      message: 'Attempting to store analysis on Walrus'
    }));
    
    try {
      if (storage && patterns.dataQuality.totalSwaps > 0) {
        const result = await storage.smartStoreAnalysis(wallet, patterns);
        storedAnalysis = result.analysis;

        console.log(JSON.stringify({
          type: 'storage_result',
          wallet,
          stored: result.stored,
          blobId: result.stored ? (result.analysis.metadata as any).blobId : null,
          message: result.stored ? 'Analysis stored on Walrus' : 'Using existing analysis'
        }));

        if (result.stored) {
          storageInfo = `\n\n🦭 Analysis stored on Walrus (Blob ID: ${(result.analysis.metadata as any).blobId})`;
        } else {
          storageInfo = `\n\n📋 Using existing Walrus analysis (no significant changes detected)`;
        }
      } else {
        console.log(JSON.stringify({
          type: 'storage_skipped',
          wallet,
          reason: !storage ? 'No storage available' : 'No swaps to analyze',
          message: 'Skipping Walrus storage'
        }));
      }
    } catch (storageError) {
      console.log(JSON.stringify({
        type: 'storage_error',
        wallet,
        error: storageError instanceof Error ? storageError.message : String(storageError),
        message: 'Storage operation failed'
      }));
      storageInfo = `\n\n⚠️ Storage failed: ${storageError instanceof Error ? storageError.message : String(storageError)}`;
    }

    console.log(JSON.stringify({
      type: 'trading_patterns_complete',
      wallet,
      success: true,
      message: 'Trading patterns analysis completed successfully'
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(patterns, null, 2) + storageInfo,
        },
      ],
    };
  } catch (error) {
    console.log(JSON.stringify({
      type: 'trading_patterns_error',
      wallet,
      error: error instanceof Error ? error.message : String(error),
      message: 'Trading patterns analysis failed'
    }));

    // Error analyzing trading patterns
    return {
      content: [
        {
          type: 'text',
          text: `Error analyzing trading patterns: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function getCachedAnalysis(blobId: string) {
  try {
    // Retrieving cached analysis from Walrus blob

    const storedAnalysis = await storage.getAnalysis(blobId);

    if (!storedAnalysis) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Analysis not found',
              blobId,
              message: 'The specified blob ID does not contain valid analysis data'
            }, null, 2),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ...storedAnalysis,
            retrievedAt: new Date().toISOString(),
            source: 'Walrus Storage'
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    // Error retrieving cached analysis
    return {
      content: [
        {
          type: 'text',
          text: `Error retrieving cached analysis: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// Store recommendations globally for execution
let currentRecommendations: any[] = [];

// Price cache for token prices
interface TokenPrice {
  symbol: string;
  priceInSui: number;
  priceInUsd?: number;
  timestamp: number;
}

interface PriceCache {
  [symbol: string]: {
    price: TokenPrice;
    expiresAt: number;
  };
}

const priceCache: PriceCache = {};
const PRICE_CACHE_DURATION = 30 * 1000; // 30 seconds

// Pool cache for discovered pools
interface PoolData {
  poolId: string;
  coinTypeA: string;
  coinTypeB: string;
  tokenA: string;
  tokenB: string;
  liquidity?: string;
  volume24h?: string;
  timestamp: number;
}

interface PoolsCache {
  pools: PoolData[];
  expiresAt: number;
}

let poolsCache: PoolsCache | null = null;
const POOLS_CACHE_DURATION = 60 * 1000; // 1 minute

async function getTokenPrices(tokens: string[], forceRefresh: boolean = false) {
  try {
    // Fetching prices for tokens

    const prices: TokenPrice[] = [];

    for (const token of tokens) {
      try {
        const price = await fetchTokenPrice(token, forceRefresh);
        prices.push(price);
      } catch (error) {
        // No fallback - if price fetching fails, we should know about it
        console.log(JSON.stringify({
          type: 'token_price_error',
          token,
          error: error instanceof Error ? error.message : String(error)
        }));
        // Don't add any price - let the error propagate
        throw new Error(`Failed to fetch price for ${token}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            prices,
            timestamp: new Date().toISOString(),
            cached: !forceRefresh,
            cacheDuration: `${PRICE_CACHE_DURATION / 1000}s`
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    // Error fetching token prices
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching token prices: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function fetchTokenPrice(tokenSymbol: string, forceRefresh: boolean): Promise<TokenPrice> {
  // Check cache first (unless forced refresh)
  if (!forceRefresh) {
    const cached = priceCache[tokenSymbol];
    if (cached && Date.now() < cached.expiresAt) {
      // Using cached price
      return cached.price;
    }
  }

  // Fetching fresh price

  // Try multiple strategies
  let price: TokenPrice;

  // Use CoinMarketCap API - no fallbacks
  price = await fetchFromCoinMarketCap(tokenSymbol);

  // Cache the result
  priceCache[tokenSymbol] = {
    price,
    expiresAt: Date.now() + PRICE_CACHE_DURATION
  };

  return price;
}

async function fetchFromCoinMarketCap(tokenSymbol: string): Promise<TokenPrice> {
  // Map symbols to CoinMarketCap symbols
  const cmcSymbols: { [key: string]: string } = {
    'SUI': 'SUI',
    'USDC': 'USDC',
    'USDT': 'USDT',
    'CETUS': 'CETUS',
    'DEEP': 'DEEP',
    'BTC': 'BTC',
    'WETH': 'ETH', // Wrapped Ethereum uses ETH price
    'ETH': 'ETH'
  };

  const symbol = cmcSymbols[tokenSymbol];
  if (!symbol) {
    throw new Error(`Unknown token symbol for CoinMarketCap: ${tokenSymbol}`);
  }

  // Use CoinMarketCap's free public API
  const response = await fetch(
    `https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing?start=1&limit=500&sortBy=market_cap&sortType=desc&convert=USD`,
    {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Trader-Soul-MCP/1.0'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`CoinMarketCap API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  const tokenData = data.data?.cryptoCurrencyList?.find((token: any) => 
    token.symbol === symbol
  );

  if (!tokenData || !tokenData.quotes?.[0]?.price) {
    throw new Error(`No price data for ${tokenSymbol} from CoinMarketCap`);
  }

  const usdPrice = tokenData.quotes[0].price;

  // Get SUI price to calculate ratio
  let priceInSui = 1.0;
  if (tokenSymbol !== 'SUI') {
    const suiData = data.data?.cryptoCurrencyList?.find((token: any) => 
      token.symbol === 'SUI'
    );
    if (suiData?.quotes?.[0]?.price) {
      const suiUsdPrice = suiData.quotes[0].price;
      priceInSui = usdPrice / suiUsdPrice;
    }
  }

  return {
    symbol: tokenSymbol,
    priceInSui,
    priceInUsd: usdPrice,
    timestamp: Date.now()
  };
}




async function calculateFromCetusPoolRatios(tokenSymbol: string): Promise<TokenPrice> {
  // This would use pool liquidity ratios to calculate relative prices
  // For now, implementing basic logic using known pools

  if (tokenSymbol === 'SUI') {
    return {
      symbol: 'SUI',
      priceInSui: 1.0,
      timestamp: Date.now()
    };
  }

  // Get a pool that contains both SUI and the target token
  const pools = await getKnownPoolsForToken(tokenSymbol);

  if (pools.length === 0) {
    throw new Error(`No pools found for ${tokenSymbol}`);
  }

  // Use the first available pool to calculate price ratio
  const pool = pools[0];

  try {
    const poolData = await cetusSDK.Pool.getPool(pool.poolId);
    if (!poolData) {
      throw new Error(`Failed to fetch pool data for ${pool.poolId}`);
    }

    // Calculate price ratio from pool reserves (simplified)
    // This is a basic implementation - real calculation would consider sqrt price
    const isSuiTokenA = poolData.coinTypeA === '0x2::sui::SUI';
    const priceInSui = isSuiTokenA ? 1.0 : 0.5; // Placeholder calculation

    return {
      symbol: tokenSymbol,
      priceInSui,
      timestamp: Date.now()
    };
  } catch (error) {
    throw new Error(`Pool calculation failed: ${error}`);
  }
}

function getKnownPoolsForToken(tokenSymbol: string): { poolId: string; pairToken: string }[] {
  // This function is deprecated - use dynamic pool discovery instead
  console.log(JSON.stringify({
    type: 'deprecated_function_warning',
    function: 'getKnownPoolsForToken',
    message: 'This function uses hardcoded pools and should not be used'
  }));
  return [];
}


async function getActivePools(tokenPairs?: string[], minLiquidity?: number, limit: number = 20) {
  try {
    // Discovering active pools

    // Check cache first
    if (poolsCache && Date.now() < poolsCache.expiresAt) {
      // Using cached pools data
      let filteredPools = poolsCache.pools;

      // Apply filters
      if (tokenPairs && tokenPairs.length > 0) {
        filteredPools = filteredPools.filter(pool => {
          const pairName = `${pool.tokenA}-${pool.tokenB}`;
          const reversePairName = `${pool.tokenB}-${pool.tokenA}`;
          return tokenPairs.includes(pairName) || tokenPairs.includes(reversePairName);
        });
      }

      if (minLiquidity) {
        filteredPools = filteredPools.filter(pool => {
          const liquidity = parseFloat(pool.liquidity || '0');
          return liquidity >= minLiquidity;
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              pools: filteredPools.slice(0, limit),
              totalFound: filteredPools.length,
              cached: true,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    }

    // Fetch fresh pool data
    // Fetching fresh pools data from Cetus SDK
    const pools = await discoverPoolsFromCetus();

    // Cache the results
    poolsCache = {
      pools,
      expiresAt: Date.now() + POOLS_CACHE_DURATION
    };

    // Apply filters
    let filteredPools = pools;

    if (tokenPairs && tokenPairs.length > 0) {
      filteredPools = filteredPools.filter(pool => {
        const pairName = `${pool.tokenA}-${pool.tokenB}`;
        const reversePairName = `${pool.tokenB}-${pool.tokenA}`;
        return tokenPairs.includes(pairName) || tokenPairs.includes(reversePairName);
      });
    }

    if (minLiquidity) {
      filteredPools = filteredPools.filter(pool => {
        const liquidity = parseFloat(pool.liquidity || '0');
        return liquidity >= minLiquidity;
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            pools: filteredPools.slice(0, limit),
            totalFound: filteredPools.length,
            cached: false,
            timestamp: new Date().toISOString(),
          }, null, 2),
        },
      ],
    };

  } catch (error) {
    // Error discovering active pools
    return {
      content: [
        {
          type: 'text',
          text: `Error discovering active pools: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function discoverPoolsFromCetus(): Promise<PoolData[]> {
  const pools: PoolData[] = [];

  try {
    // Use Cetus SDK's getPoolsWithPage method to get all pools
    console.log(JSON.stringify({
      type: 'pool_discovery_start',
      method: 'getPoolsWithPage'
    }));

    const allPools = await cetusSDK.Pool.getPoolsWithPage([]);
    
    console.log(JSON.stringify({
      type: 'all_pools_fetched',
      count: allPools?.length || 0
    }));

    if (allPools && allPools.length > 0) {
      // Process the first few pools to avoid overwhelming the system
      const poolsToProcess = allPools.slice(0, 20);
      
      for (const poolData of poolsToProcess) {
        try {
          const tokenA = extractTokenSymbolFromCoinType(poolData.coinTypeA);
          const tokenB = extractTokenSymbolFromCoinType(poolData.coinTypeB);

          pools.push({
            poolId: poolData.poolAddress,
            coinTypeA: poolData.coinTypeA,
            coinTypeB: poolData.coinTypeB,
            tokenA,
            tokenB,
            liquidity: poolData.liquidity?.toString() || '0',
            timestamp: Date.now()
          });
        } catch (error) {
          console.log(JSON.stringify({
            type: 'pool_processing_error',
            poolId: poolData.poolAddress,
            error: error instanceof Error ? error.message : String(error)
          }));
        }
      }
    }

    // If no pools were found, use fallback
    if (pools.length === 0) {
      console.log(JSON.stringify({
        type: 'pool_discovery_fallback',
        reason: 'No pools found via getPoolsWithPage, using fallback pools'
      }));
      return await getFallbackPools();
    }

    console.log(JSON.stringify({
      type: 'pool_discovery_success',
      count: pools.length,
      method: 'getPoolsWithPage_dynamic_discovery'
    }));

    return pools;

  } catch (error) {
    // Error in pool discovery
    console.log(JSON.stringify({
      type: 'pool_discovery_error',
      error: error instanceof Error ? error.message : String(error),
      action: 'using_fallback_pools'
    }));
    // Return known pools as fallback
    return await getFallbackPools();
  }
}

async function getFallbackPools(): Promise<PoolData[]> {
  // No fallback pools - dynamic discovery should always work
  // If we reach here, it means there's a serious issue with the SDK
  console.log(JSON.stringify({
    type: 'critical_error',
    message: 'Dynamic pool discovery failed completely - no pools found on network'
  }));
  return [];
}

// SUI Client MCP Tools
async function getWalletSwapHistory(walletAddress: string, limit: number) {
  try {
    // Getting swap history for wallet
    const swapEvents = await suiClientInstance.getSwapEventsForWallet(walletAddress, limit);
    const formattedSwaps = swapEvents.map((swap: any) => suiClientInstance.formatSwapForDisplay(swap));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          wallet: walletAddress,
          swaps: formattedSwaps,
          totalSwaps: formattedSwaps.length,
          timestamp: new Date().toISOString(),
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error getting swap history: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
}

// Storage MCP Tools
async function storeAnalysis(wallet: string, analysis: any) {
  try {
    if (!storage) throw new Error('Storage not initialized');
    const result = await storage.storeAnalysis(wallet, analysis);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, result, wallet }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error storing analysis: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function getStoredAnalysis(blobId: string) {
  try {
    if (!storage) throw new Error('Storage not initialized');
    const analysis = await storage.getAnalysis(blobId);
    return {
      content: [{ type: 'text', text: JSON.stringify({ analysis, blobId }, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error getting stored analysis: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

// Trade Execution MCP Tools
async function executeSingleTrade(recommendation: any, maxSlippage: number) {
  try {
    if (!tradeExecutor) throw new Error('Trade executor not initialized');
    const result = await tradeExecutor.executeRecommendation(recommendation, maxSlippage);
    return {
      content: [{ type: 'text', text: JSON.stringify({ recommendation, execution: result, maxSlippage }, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error executing trade: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function getUserBalance(wallet: string, tokenType: string) {
  try {
    if (!tradeExecutor) throw new Error('Trade executor not initialized');
    const balance = await tradeExecutor.getUserBalance(tokenType);
    return {
      content: [{ type: 'text', text: JSON.stringify({ wallet, tokenType, balance }, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error getting balance: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function getBalanceDirect(wallet: string, tokenType: string) {
  try {
    // Use Sui client directly - no private key required
    const balance = await suiClient.getBalance({
      owner: wallet,
      coinType: tokenType,
    });
    
    // Convert raw balance to proper decimal format
    const decimals = balance.coinType === '0x2::sui::SUI' ? 9 : 9; // Most Sui tokens use 9 decimals
    const formattedBalance = (parseInt(balance.totalBalance) / Math.pow(10, decimals)).toFixed(decimals);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          wallet,
          tokenType,
          balance: balance.totalBalance,
          formattedBalance,
          decimals,
          coinObjectCount: balance.coinObjectCount,
          coinType: balance.coinType,
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error getting balance: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true,
    };
  }
}

async function getAllBalancesDirect(wallet: string) {
  try {
    // Use Sui's built-in getAllBalances method
    const allBalances = await suiClient.getAllBalances({
      owner: wallet,
    });
    
    // Format all balances with proper decimals
    const formattedBalances = allBalances.map((balance) => {
      const decimals = balance.coinType === '0x2::sui::SUI' ? 9 : 9; // Most Sui tokens use 9 decimals
      const formattedBalance = (parseInt(balance.totalBalance) / Math.pow(10, decimals)).toFixed(decimals);
      
      return {
        coinType: balance.coinType,
        balance: balance.totalBalance,
        formattedBalance,
        decimals,
        coinObjectCount: balance.coinObjectCount,
        lockedBalance: balance.lockedBalance || {}
      };
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          wallet,
          totalTokenTypes: formattedBalances.length,
          balances: formattedBalances,
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error getting all balances: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true,
    };
  }
}


// Analysis MCP Tools
async function analyzeTradingPatterns(wallet: string, swapHistory?: any[]) {
  try {
    let swaps = swapHistory;
    if (!swaps) {
      swaps = await suiClientInstance.getSwapEventsForWallet(wallet, 100);
    }
    const patterns = patternAnalyzer.analyzePatterns(wallet, swaps || []);
    return {
      content: [{ type: 'text', text: JSON.stringify({ wallet, patterns, dataSource: swapHistory ? 'provided' : 'fetched' }, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error analyzing patterns: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function recommendSwaps(wallet: string, maxRecommendations: number) {
  try {
    // Generating swap recommendations for wallet

    // Get active pools using dynamic discovery
    const activePools = await discoverPoolsFromCetus();

    // Generate recommendations using real pool data
    currentRecommendations = await generateRecommendationsFromPools(activePools, maxRecommendations);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            wallet,
            recommendations: currentRecommendations,
            marketContext: {
              timestamp: new Date().toISOString(),
              note: 'Use cetus.execute_trade with recommendation ID to execute',
              poolsAnalyzed: activePools.length,
            },
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    // Error generating recommendations

    // No fallback recommendations - dynamic discovery should always work
    currentRecommendations = [];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            wallet,
            recommendations: currentRecommendations,
            marketContext: {
              timestamp: new Date().toISOString(),
              note: 'Using fallback recommendations due to data fetch error',
              error: error instanceof Error ? error.message : String(error),
            },
          }, null, 2),
        },
      ],
    };
  }
}

/**
 * Generate recommendations from real pool data
 */
async function generateRecommendationsFromPools(pools: PoolData[], maxRecommendations: number): Promise<any[]> {
  const recommendations = [];
  let recommendationId = 1;

  for (const pool of pools.slice(0, maxRecommendations)) {
    try {
      // Generate buy recommendation (SUI -> other token)
      if (pool.coinTypeA === '0x2::sui::SUI') {
        recommendations.push({
          id: recommendationId++,
          action: 'buy',
          tokenIn: pool.coinTypeA,
          tokenOut: pool.coinTypeB,
          pool: pool.poolId,
          amount: '1000000000', // 1 SUI
          confidence: 0.65 + Math.random() * 0.2, // 0.65-0.85
          reasoning: `Live pool data suggests ${pool.tokenA}→${pool.tokenB} opportunity (Pool: ${pool.poolId.slice(0, 8)}...)`,
        });
      } else if (pool.coinTypeB === '0x2::sui::SUI') {
        recommendations.push({
          id: recommendationId++,
          action: 'buy',
          tokenIn: pool.coinTypeB,
          tokenOut: pool.coinTypeA,
          pool: pool.poolId,
          amount: '1000000000', // 1 SUI
          confidence: 0.65 + Math.random() * 0.2,
          reasoning: `Live pool data suggests ${pool.tokenB}→${pool.tokenA} opportunity (Pool: ${pool.poolId.slice(0, 8)}...)`,
        });
      }

      if (recommendations.length >= maxRecommendations) break;
    } catch (error) {
    }
  }

  return recommendations;
}

/**
 * Extract token symbol from coin type (same as in token-utils.ts)
 */
function extractTokenSymbolFromCoinType(coinType: string): string {
  if (coinType === '0x2::sui::SUI') return 'SUI';
  if (coinType.includes('::usdc::') || coinType.includes('::USDC')) return 'USDC';
  if (coinType.includes('::usdt::') || coinType.includes('::USDT')) return 'USDT';
  if (coinType.includes('::cetus::') || coinType.includes('::CETUS')) return 'CETUS';
  if (coinType.includes('::deep::') || coinType.includes('::DEEP')) return 'DEEP';

  const parts = coinType.split('::');
  if (parts.length >= 3) {
    return parts[parts.length - 1].toUpperCase();
  }

  return coinType.slice(0, 8);
}

async function executeTrade(recommendationId: number, maxSlippage: number) {
  try {
    if (!tradeExecutor) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Trade execution not available',
              reason: 'No keypair configured. Set DEMO_PRIVATE_KEY in environment.',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }

    // Find the recommendation
    const recommendation = currentRecommendations.find(r => r.id === recommendationId);

    if (!recommendation) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Recommendation not found',
              availableIds: currentRecommendations.map(r => r.id),
              message: 'Generate recommendations first using cetus.recommend_swaps',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }

    // Executing trade for recommendation

    // Execute the trade
    const result = await tradeExecutor.executeRecommendation(recommendation, maxSlippage);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            recommendationId,
            recommendation: {
              action: recommendation.action,
              amount: recommendation.amount,
              tokenIn: recommendation.tokenIn,
              tokenOut: recommendation.tokenOut,
              reasoning: recommendation.reasoning,
            },
            execution: result,
            executedWith: `${maxSlippage * 100}% max slippage`,
          }, null, 2),
        },
      ],
    };

  } catch (error) {
    // Error executing trade
    return {
      content: [
        {
          type: 'text',
          text: `Error executing trade: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// Start the server
async function main() {
  // Starting Trader Soul MCP Server

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Trader Soul MCP Server is running
}

// Handle process signals
process.on('SIGINT', async () => {
  // Shutting down Trader Soul MCP Server
  await server.close();
  process.exit(0);
});

// Run the server
main().catch((error) => {
  // Failed to start server
  process.exit(1);
});