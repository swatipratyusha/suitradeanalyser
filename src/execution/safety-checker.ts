/**
 * Safety checks for trade execution
 */

import { SuiClient } from '@mysten/sui/client';
import { ExecutionRequest, TradeRecommendation, SafetyCheck, ExecutionContext } from './types.js';

export class SafetyChecker {
  constructor(private suiClient: SuiClient) {}

  async validateExecution(context: ExecutionContext): Promise<SafetyCheck> {
    const { recommendation, request, userBalance } = context;
    const errors: string[] = [];

    // Check 1: Position size limit (max 10% of portfolio)
    const positionSizeOk = await this.checkPositionSize(
      recommendation.amount,
      userBalance,
      request.maxPositionSize || 0.1
    );
    if (!positionSizeOk) {
      errors.push(`Position size exceeds limit (${(request.maxPositionSize || 0.1) * 100}% max)`);
    }

    // Check 2: Slippage tolerance (max 3%)
    const slippageOk = (request.maxSlippage || 0.03) <= 0.05; // Cap at 5%
    if (!slippageOk) {
      errors.push(`Slippage tolerance too high (max 5%)`);
    }

    // Check 3: Execution deadline (30 seconds from request)
    const deadlineOk = await this.checkDeadline(context.timestamp, request.deadline || 30);
    if (!deadlineOk) {
      errors.push('Execution deadline exceeded (30s limit)');
    }

    // Check 4: Sufficient balance
    const balanceOk = await this.checkBalance(
      request.userAddress,
      recommendation.tokenIn,
      recommendation.amount
    );
    if (!balanceOk) {
      errors.push('Insufficient token balance for trade');
    }

    return {
      positionSizeOk,
      slippageOk,
      deadlineOk,
      balanceOk,
      errors
    };
  }

  private async checkPositionSize(
    tradeAmount: string,
    userBalance: string,
    maxPositionRatio: number
  ): Promise<boolean> {
    const tradeAmountNum = parseFloat(tradeAmount);
    const balanceNum = parseFloat(userBalance);

    if (balanceNum === 0) return false;

    const positionRatio = tradeAmountNum / balanceNum;
    return positionRatio <= maxPositionRatio;
  }

  private async checkDeadline(requestTimestamp: number, deadlineSeconds: number): Promise<boolean> {
    const now = Date.now();
    const elapsed = (now - requestTimestamp) / 1000; // Convert to seconds
    return elapsed <= deadlineSeconds;
  }

  private async checkBalance(
    userAddress: string,
    tokenType: string,
    requiredAmount: string
  ): Promise<boolean> {
    try {
      // Get user's balance for the specific token
      const balance = await this.suiClient.getBalance({
        owner: userAddress,
        coinType: tokenType
      });

      const availableBalance = BigInt(balance.totalBalance);
      const requiredBalanceBigInt = BigInt(requiredAmount);

      return availableBalance >= requiredBalanceBigInt;
    } catch (error) {
      console.error('Error checking balance:', error);
      return false;
    }
  }

  /**
   * Calculate maximum safe trade amount based on portfolio size
   */
  async calculateMaxSafeAmount(
    userAddress: string,
    tokenType: string,
    maxPositionRatio: number = 0.1
  ): Promise<string> {
    try {
      const balance = await this.suiClient.getBalance({
        owner: userAddress,
        coinType: tokenType
      });

      const totalBalance = BigInt(balance.totalBalance);
      const maxSafeAmount = totalBalance * BigInt(Math.floor(maxPositionRatio * 100)) / BigInt(100);

      return maxSafeAmount.toString();
    } catch (error) {
      console.error('Error calculating max safe amount:', error);
      return '0';
    }
  }

  /**
   * Validate recommendation before execution
   */
  validateRecommendation(recommendation: TradeRecommendation): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!recommendation.tokenIn) errors.push('Missing tokenIn');
    if (!recommendation.tokenOut) errors.push('Missing tokenOut');
    if (!recommendation.pool) errors.push('Missing pool ID');
    if (!recommendation.amount || recommendation.amount === '0') errors.push('Invalid amount');

    // Check confidence threshold
    if (recommendation.confidence < 0.5) {
      errors.push(`Low confidence recommendation (${recommendation.confidence})`);
    }

    // Check action validity
    if (!['buy', 'sell'].includes(recommendation.action)) {
      errors.push('Invalid action (must be buy or sell)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}