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
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { suiClient } from '../sui/client.js';
import { patternAnalyzer } from '../analysis/patterns.js';

// Tool schemas
const GetSwapHistorySchema = z.object({
  wallet: z.string().describe('Sui wallet address'),
  limit: z.number().optional().default(50).describe('Maximum number of swaps to return'),
});

const GetTradingPatternsSchema = z.object({
  wallet: z.string().describe('Sui wallet address'),
});

const RecommendSwapsSchema = z.object({
  wallet: z.string().describe('Sui wallet address'),
  maxRecommendations: z.number().optional().default(3).describe('Maximum number of recommendations'),
});

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

// Define available tools
const tools: Tool[] = [
  {
    name: 'cetus.get_swap_history',
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
    name: 'cetus.get_trading_patterns',
    description: 'Analyze trading patterns and discover playbooks for a wallet',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Sui wallet address to analyze',
        },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'cetus.recommend_swaps',
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
      case 'cetus.get_swap_history': {
        const { wallet, limit } = GetSwapHistorySchema.parse(args);
        return await getSwapHistory(wallet, limit);
      }

      case 'cetus.get_trading_patterns': {
        const { wallet } = GetTradingPatternsSchema.parse(args);
        return await getTradingPatterns(wallet);
      }

      case 'cetus.recommend_swaps': {
        const { wallet, maxRecommendations } = RecommendSwapsSchema.parse(args);
        return await recommendSwaps(wallet, maxRecommendations);
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
    console.log(`Getting swap history for wallet: ${wallet}`);

    const swapEvents = await suiClient.getSwapEventsForWallet(wallet, Math.max(limit, 500));

    const formattedSwaps = swapEvents.map(swap => suiClient.formatSwapForDisplay(swap));

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
    console.error('Error fetching swap history:', error);
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

async function getTradingPatterns(wallet: string) {
  try {
    console.log(`Analyzing trading patterns for wallet: ${wallet}`);

    // Fetch swap history for analysis
    const swapEvents = await suiClient.getSwapEventsForWallet(wallet, 500);

    // Analyze patterns
    const patterns = patternAnalyzer.analyzePatterns(wallet, swapEvents);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(patterns, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error('Error analyzing trading patterns:', error);
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

async function recommendSwaps(wallet: string, maxRecommendations: number) {
  // TODO: Implement recommendation engine
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          wallet,
          recommendations: [
            {
              action: 'buy',
              token: 'SUI',
              pool: 'SUI/USDC',
              confidence: 0.78,
              reasoning: 'Matches your breakout_buyer pattern - SUI up 4.2% in last hour',
              suggestedAmount: '1000000000', // 1 SUI
              currentPrice: '1.05',
              stopLoss: '1.02',
              target: '1.12',
            },
            {
              action: 'buy',
              token: 'CETUS',
              pool: 'CETUS/SUI',
              confidence: 0.65,
              reasoning: 'Volume spike detected, fits your momentum style',
              suggestedAmount: '2000000000', // 2 SUI worth
              currentPrice: '0.025',
              stopLoss: '0.023',
              target: '0.029',
            },
          ],
          marketContext: {
            timestamp: new Date().toISOString(),
            suiPrice: 1.05,
            volatility: 'medium',
          },
        }, null, 2),
      },
    ],
  };
}

// Start the server
async function main() {
  console.log('🚀 Starting Trader Soul MCP Server...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log('✅ Trader Soul MCP Server is running');
  console.log('Available tools:');
  tools.forEach(tool => {
    console.log(`  - ${tool.name}: ${tool.description}`);
  });
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Trader Soul MCP Server...');
  await server.close();
  process.exit(0);
});

// Run the server
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}