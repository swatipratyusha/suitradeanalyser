/**
 * Sui client for fetching Cetus swap events and data
 */

import fetch from 'node-fetch';

const SUI_RPC_URL = 'https://fullnode.mainnet.sui.io:443';
const CETUS_CLMM_PACKAGE = '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb';

export interface SwapEvent {
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

export interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

export interface EventQueryResult {
  data: any[];
  nextCursor?: any;
  hasNextPage: boolean;
}

class SuiClient {
  private rpcUrl: string;

  constructor(rpcUrl: string = SUI_RPC_URL) {
    this.rpcUrl = rpcUrl;
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
        "MoveEventType": `${CETUS_CLMM_PACKAGE}::pool::SwapEvent`
      },
      cursor,
      limit,
      true // descending order
    ];

    return await this.rpcCall<EventQueryResult>('suix_queryEvents', params);
  }

  async getSwapEventsForWallet(walletAddress: string, limit: number = 100): Promise<SwapEvent[]> {
    const allSwaps: SwapEvent[] = [];
    let cursor: any = null;
    let fetched = 0;

    console.log(`Fetching swap events for wallet: ${walletAddress}`);

    while (fetched < limit) {
      const batchSize = Math.min(50, limit - fetched);

      try {
        const result = await this.getCetusSwapEvents(cursor, batchSize);

        if (!result.data || result.data.length === 0) {
          break;
        }

        // Filter events by sender (wallet address)
        const walletSwaps = result.data
          .filter(event => event.sender === walletAddress)
          .map(event => this.parseSwapEvent(event));

        allSwaps.push(...walletSwaps);
        fetched += result.data.length;
        cursor = result.nextCursor;

        console.log(`Found ${walletSwaps.length} swaps in batch of ${result.data.length} events`);

        if (!cursor || !result.hasNextPage) {
          break;
        }

        // Add small delay to be nice to the RPC
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error('Error fetching events:', error);
        break;
      }
    }

    console.log(`Total swaps found for wallet: ${allSwaps.length}`);
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
    // This is a simplified mapping - in production you'd fetch pool metadata
    const knownPools: { [key: string]: string } = {
      '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630': 'SUI/USDC',
      '0xc8d7a1503dc2f9f5b05449a87d8733593e2f0f3e7bffd90541252782e4d2ca20': 'USDC/USDT',
      '0x5b0b24c27ccf6d0e98f3a8704d2e577de83fa574d3a9060eb8945eeb82b3e2df': 'CETUS/SUI',
    };

    return knownPools[poolId] || `Pool:${poolId.slice(0, 8)}...`;
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

export const suiClient = new SuiClient();