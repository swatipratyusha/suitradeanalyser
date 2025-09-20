/**
 * Storage schema for trading analysis data on Walrus
 */

import { TradingPatterns } from '../analysis/patterns.js';

export interface StoredAnalysis {
  id: string;
  wallet: string;
  analysis: TradingPatterns;
  storedAt: string;
  version: string;
  metadata: {
    dataHash: string;
    swapCount: number;
    confidenceLevel: 'low' | 'medium' | 'high';
    expiresAt?: string; // Optional expiration for cache invalidation
  };
}

export interface AnalysisCache {
  wallet: string;
  lastAnalysis?: StoredAnalysis;
  historicalAnalyses: StoredAnalysis[];
  aggregatedInsights?: {
    tradingEvolution: string[];
    consistencyScore: number;
    improvementAreas: string[];
  };
}

export interface WalrusStorageConfig {
  network: 'testnet' | 'mainnet';
  epochs: number; // Storage duration
  suiRpcUrl: string;
  defaultDeleteable: boolean;
}

export const DEFAULT_STORAGE_CONFIG: WalrusStorageConfig = {
  network: 'testnet',
  epochs: 10, // ~10 epochs storage duration
  suiRpcUrl: 'https://fullnode.testnet.sui.io:443',
  defaultDeleteable: true
};

export function generateAnalysisId(wallet: string, timestamp: number): string {
  return `analysis-${wallet.slice(0, 8)}-${timestamp}`;
}

export function generateCacheId(wallet: string): string {
  return `cache-${wallet}`;
}

export function hashAnalysisData(patterns: TradingPatterns): string {
  // Simple hash based on key data points
  const keyData = {
    swapCount: patterns.dataQuality.totalSwaps,
    topToken: patterns.tokenPreferences.favoriteTokens[0]?.token,
    tradingStyle: patterns.tradingRhythm.tradingStyle,
    analysisDate: patterns.analysisDate
  };

  return Buffer.from(JSON.stringify(keyData)).toString('base64').slice(0, 16);
}

export function shouldUpdateAnalysis(
  existing: StoredAnalysis | undefined,
  newSwapCount: number,
  newDataHash: string
): boolean {
  if (!existing) return true;

  // Update if significant new data (>10% more swaps or different hash)
  const existingSwapCount = existing.metadata.swapCount;
  const swapIncrease = (newSwapCount - existingSwapCount) / existingSwapCount;

  return swapIncrease > 0.1 || existing.metadata.dataHash !== newDataHash;
}