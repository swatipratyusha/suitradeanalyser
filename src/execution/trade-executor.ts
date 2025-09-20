/**
 * Trade executor using Cetus SDK
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { NetworkConfig, getNetworkConfig } from '../config/networks.js';
import { initCetusSDK, adjustForSlippage, Percentage, d } from '@cetusprotocol/cetus-sui-clmm-sdk';
import BN from 'bn.js';

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
    
    console.log(`🌐 Trade executor initialized for ${this.networkConfig.name} network`);
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
      console.log(`🔄 Executing recommendation #${recommendation.id}`);
      console.log(`   ${recommendation.action.toUpperCase()}: ${recommendation.amount} ${recommendation.tokenIn} → ${recommendation.tokenOut}`);
      console.log(`   Pool: ${recommendation.pool}`);
      console.log(`   Confidence: ${recommendation.confidence}`);

      // Get pool data using Cetus SDK
      const pool = await this.cetusSDK.Pool.getPool(recommendation.pool);
      if (!pool) {
        throw new Error(`Pool ${recommendation.pool} not found`);
      }

      console.log(`📦 Using pool: ${pool.poolAddress} (${this.networkConfig.name})`);

      // Determine swap direction (a2b or b2a)
      const coinTypeA = pool.coinTypeA;
      const coinTypeB = pool.coinTypeB;
      const a2b = recommendation.tokenIn === coinTypeA;

      console.log(`🔄 Swap direction: ${a2b ? 'A→B' : 'B→A'}`);
      console.log(`   Coin A: ${coinTypeA}`);
      console.log(`   Coin B: ${coinTypeB}`);
      console.log(`   Token In: ${recommendation.tokenIn}`);
      console.log(`   a2b: ${a2b}`);

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

      console.log(`📊 Preswap result:`);
      console.log(`   Amount in: ${preswapResult.estimatedAmountIn}`);
      console.log(`   Amount out: ${preswapResult.estimatedAmountOut}`);
      console.log(`   After sqrt price: ${preswapResult.estimatedEndSqrtPrice}`);

      // Calculate minimum amount out with slippage protection using SDK function
      const slippage = Percentage.fromDecimal(d(maxSlippage));
      const toAmount = new BN(preswapResult.estimatedAmountOut);
      const amountLimit = adjustForSlippage(toAmount, slippage, false); // false because we're fixing input amount
      
      console.log(`🛡️ Min amount out (${maxSlippage * 100}% slippage): ${amountLimit.toString()}`);

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

      console.log(`📝 Swap payload created`);

      // Execute the swap transaction
      console.log('📡 Submitting transaction...');
      const result = await this.suiClient.signAndExecuteTransaction({
        signer: this.keypair,
        transaction: await swapPayload,
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