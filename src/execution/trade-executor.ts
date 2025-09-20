/**
 * Simple trade executor using Cetus SDK
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { NetworkConfig, getNetworkConfig } from '../config/networks.js';

export interface SimpleRecommendation {
  id: number;
  action: 'buy' | 'sell';
  tokenIn: string;
  tokenOut: string;
  pool: string;
  amount: string;
  confidence: number;
  reasoning: string;
}

export interface ExecutionResult {
  success: boolean;
  transactionDigest?: string;
  error?: string;
  executedAt: number;
}

export class SimpleTradeExecutor {
  private networkConfig: NetworkConfig;

  constructor(
    private suiClient: any, // Use any for now to avoid type conflicts
    private keypair: Ed25519Keypair,
    networkConfig?: NetworkConfig
  ) {
    this.networkConfig = networkConfig || getNetworkConfig();
    console.log(`🌐 Trade executor initialized for ${this.networkConfig.name} network`);
  }

  /**
   * Execute a single recommendation using Cetus
   */
  async executeRecommendation(
    recommendation: SimpleRecommendation,
    maxSlippage: number = 0.03 // 3% default
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      console.log(`🔄 Executing recommendation #${recommendation.id}`);
      console.log(`   ${recommendation.action.toUpperCase()}: ${recommendation.amount} ${recommendation.tokenIn} → ${recommendation.tokenOut}`);
      console.log(`   Pool: ${recommendation.pool}`);
      console.log(`   Confidence: ${recommendation.confidence}`);

      // Create transaction block
      const txb = new Transaction();

      // Use network-specific Cetus package ID
      const CETUS_PACKAGE_ID = this.networkConfig.cetusPackageId;
      console.log(`📦 Using Cetus package: ${CETUS_PACKAGE_ID} (${this.networkConfig.name})`);

      // Calculate minimum amount out (with slippage protection)
      const amountIn = BigInt(recommendation.amount);
      const minAmountOut = this.calculateMinAmountOut(amountIn, maxSlippage);

      // Add swap function call
      // Note: This is a simplified version - real Cetus integration would need proper pool/coin types
      const swapResult = txb.moveCall({
        target: `${CETUS_PACKAGE_ID}::router::swap_exact_input`,
        arguments: [
          txb.object(recommendation.pool), // Pool object
          txb.pure.u64(recommendation.amount), // Amount in
          txb.pure.u64(minAmountOut.toString()), // Min amount out
          txb.pure.bool(true), // A to B direction (simplified)
        ],
        typeArguments: [recommendation.tokenIn, recommendation.tokenOut],
      });

      // Set gas budget and sender
      txb.setSender(this.keypair.toSuiAddress());
      txb.setGasBudget(10000000); // 0.01 SUI

      // Execute transaction
      console.log('📡 Submitting transaction...');
      const result = await this.suiClient.signAndExecuteTransaction({
        signer: this.keypair,
        transaction: txb,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      if (result.effects?.status?.status === 'success') {
        console.log('✅ Trade executed successfully!');
        console.log(`   Transaction: ${result.digest}`);

        return {
          success: true,
          transactionDigest: result.digest,
          executedAt: startTime,
        };
      } else {
        const error = result.effects?.status?.error || 'Unknown transaction error';
        console.log('❌ Trade failed:', error);

        return {
          success: false,
          error: error,
          executedAt: startTime,
        };
      }

    } catch (error) {
      console.error('❌ Execution error:', error);

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

  private calculateMinAmountOut(amountIn: bigint, maxSlippage: number): bigint {
    // Simplified slippage calculation
    // In real implementation, this would use pool pricing
    const slippageMultiplier = BigInt(Math.floor((1 - maxSlippage) * 10000));
    return (amountIn * slippageMultiplier) / BigInt(10000);
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
      return balance.totalBalance;
    } catch (error) {
      console.error('Error getting balance:', error);
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
}