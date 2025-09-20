/**
 * Walrus storage client for trading analysis data
 */

import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { WalrusClient, WalrusFile } from '@mysten/walrus';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  StoredAnalysis,
  AnalysisCache,
  WalrusStorageConfig,
  DEFAULT_STORAGE_CONFIG,
  generateAnalysisId,
  generateCacheId,
  hashAnalysisData,
  shouldUpdateAnalysis
} from './schema.js';
import { TradingPatterns } from '../analysis/patterns.js';
import { NetworkConfig, getNetworkConfig } from '../config/networks.js';

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

    console.log(`💾 Walrus storage initialized for ${this.networkConfig.name} (walrus: ${this.config.network})`);

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
    console.log(`📝 JSON content preview (first 200 chars): ${jsonString.substring(0, 200)}`);

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

    console.log(`✅ Stored analysis for wallet ${wallet.slice(0, 8)}... on Walrus (Blob ID: ${results[0].blobId})`);

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
      console.log(`📥 Retrieving analysis from Walrus blob: ${blobId}`);

      // Use getBlob instead of getFiles to avoid corruption
      const blob = await this.walrusClient.getBlob({ blobId });
      console.log(`✅ Blob retrieved successfully`);

      // Get files from the blob
      const files = await blob.files();
      console.log(`📁 Found ${files.length} files in blob`);

      if (files.length === 0) {
        console.log(`❌ No files found in blob ${blobId}`);
        return null;
      }

      // Get the first file (our JSON analysis)
      const file = files[0];
      console.log(`📄 Processing file: ${await file.getIdentifier()}`);

      // Extract content
      const content = await file.text();
      console.log(`📊 File content length: ${content.length} characters`);
      console.log(`📋 Content preview: ${content.substring(0, 100)}...`);

      // Parse JSON
      const analysis = JSON.parse(content) as StoredAnalysis;
      console.log(`✅ Successfully parsed analysis for wallet ${analysis.wallet.slice(0, 8)}...`);

      return analysis;
    } catch (error) {
      console.warn(`Failed to retrieve analysis from blob ${blobId}:`, error);
      return null;
    }
  }

  /**
   * Store or update analysis cache for a wallet
   */
  async storeAnalysisCache(cache: AnalysisCache): Promise<string> {
    if (!this.keypair) {
      throw new Error('Keypair required for storage operations');
    }

    const cacheId = generateCacheId(cache.wallet);

    const file = WalrusFile.from({
      contents: new TextEncoder().encode(JSON.stringify(cache, null, 2)),
      identifier: `${cacheId}.json`
    });

    const results = await this.walrusClient.writeFiles({
      files: [file],
      epochs: this.config.epochs,
      deletable: this.config.defaultDeleteable,
      signer: this.keypair
    });

    console.log(`✅ Stored analysis cache for wallet ${cache.wallet.slice(0, 8)}... on Walrus (Blob ID: ${results[0].blobId})`);

    return results[0].blobId;
  }

  /**
   * Get analysis cache for a wallet
   */
  async getAnalysisCache(blobId: string): Promise<AnalysisCache | null> {
    try {
      console.log(`📥 Retrieving analysis cache from Walrus blob: ${blobId}`);

      // Use getBlob instead of getFiles to avoid corruption
      const blob = await this.walrusClient.getBlob({ blobId });
      const files = await blob.files();

      if (files.length === 0) {
        return null;
      }

      const file = files[0];
      const content = await file.text();
      return JSON.parse(content) as AnalysisCache;
    } catch (error) {
      console.warn(`Failed to retrieve cache from blob ${blobId}:`, error);
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
      console.log(`⏭️ Skipping storage - no significant changes for wallet ${wallet.slice(0, 8)}...`);
      return { stored: false, analysis: existingAnalysis! };
    }

    const storedAnalysis = await this.storeAnalysis(wallet, patterns);
    return { stored: true, analysis: storedAnalysis };
  }

  /**
   * Generate aggregated insights from multiple analyses
   */
  generateAggregatedInsights(analyses: StoredAnalysis[]): AnalysisCache['aggregatedInsights'] {
    if (analyses.length < 2) {
      return undefined;
    }

    const sortedAnalyses = analyses.sort((a, b) =>
      new Date(a.storedAt).getTime() - new Date(b.storedAt).getTime()
    );

    const tradingEvolution: string[] = [];
    const consistencyScores: number[] = [];

    // Analyze changes over time
    for (let i = 1; i < sortedAnalyses.length; i++) {
      const prev = sortedAnalyses[i - 1].analysis;
      const curr = sortedAnalyses[i].analysis;

      // Trading style evolution
      if (prev.tradingRhythm.tradingStyle !== curr.tradingRhythm.tradingStyle) {
        tradingEvolution.push(
          `Trading style evolved from ${prev.tradingRhythm.tradingStyle} to ${curr.tradingRhythm.tradingStyle}`
        );
      }

      // Token preference changes
      const prevTopToken = prev.tokenPreferences.favoriteTokens[0]?.token;
      const currTopToken = curr.tokenPreferences.favoriteTokens[0]?.token;
      if (prevTopToken && currTopToken && prevTopToken !== currTopToken) {
        tradingEvolution.push(
          `Shifted primary focus from ${prevTopToken} to ${currTopToken}`
        );
      }

      // Calculate consistency score based on trade sizing consistency
      if (curr.tradingSizing.consistency === 'very_consistent') consistencyScores.push(1.0);
      else if (curr.tradingSizing.consistency === 'consistent') consistencyScores.push(0.75);
      else if (curr.tradingSizing.consistency === 'varied') consistencyScores.push(0.5);
      else consistencyScores.push(0.25);
    }

    const avgConsistency = consistencyScores.reduce((a, b) => a + b, 0) / consistencyScores.length;

    // Generate improvement areas
    const latestAnalysis = sortedAnalyses[sortedAnalyses.length - 1].analysis;
    const improvementAreas: string[] = [];

    if (latestAnalysis.dataQuality.dataConfidence === 'low') {
      improvementAreas.push('Increase trading volume for better pattern recognition');
    }

    if (latestAnalysis.tradingSizing.consistency === 'highly_varied') {
      improvementAreas.push('Consider more consistent position sizing');
    }

    if (latestAnalysis.tokenPreferences.tokenCategories.major < 50) {
      improvementAreas.push('Focus on major tokens for better liquidity');
    }

    return {
      tradingEvolution,
      consistencyScore: Math.round(avgConsistency * 100) / 100,
      improvementAreas
    };
  }
}