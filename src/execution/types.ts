/**
 * Types for trade execution MVP
 */

export interface TradeRecommendation {
  id: number;
  action: 'buy' | 'sell';
  tokenIn: string;        // Token being sold
  tokenOut: string;       // Token being bought
  pool: string;           // Cetus pool ID
  amount: string;         // Amount in tokenIn
  confidence: number;     // 0-1 confidence score
  reasoning: string;      // AI explanation
  suggestedAmount: string; // Original recommendation
  currentPrice?: string;  // Current market price
  stopLoss?: string;      // Stop loss price
  target?: string;        // Target price
}

export interface ExecutionRequest {
  recommendationId: number;
  userAddress: string;
  maxSlippage?: number;   // Default 3%
  maxPositionSize?: number; // Default 10% of portfolio
  deadline?: number;      // Default 30 seconds
}

export interface ExecutionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  executedAt: number;
  actualAmount?: string;
  actualPrice?: string;
  slippage?: number;
  gasCost?: string;
}

export interface SafetyCheck {
  positionSizeOk: boolean;
  slippageOk: boolean;
  deadlineOk: boolean;
  balanceOk: boolean;
  errors: string[];
}

export interface ExecutionContext {
  recommendation: TradeRecommendation;
  request: ExecutionRequest;
  timestamp: number;
  userBalance: string;
  estimatedGas: string;
}