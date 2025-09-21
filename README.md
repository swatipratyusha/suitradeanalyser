# Sui Trading Analysis Platform

*Hackathon Project - Sui-mming 2025*

## Overview

An AI-powered personalised trading assistant that analyses Sui blockchain trading patterns, provides intelligent insights through persistent storage on Walrus, and executes trades automatically via Claude/GPT integration using Model Context Protocol (MCP).

**Core Innovation**: An autonomous trading intelligence system that learns from historical data, maintains persistent memory through decentralised storage, and executes trades through natural language interaction.

## Key Features

### AI-Powered Pattern Analysis (current version uses statistical analyses but goal is ML models in the future)
- Real-time analysis of Cetus DEX trading history (current support only for spot trades)
- Trading personality discovery and behavioural pattern recognition
- Token preference identification and trading consistency analysis
- Historical pattern tracking with evolution analysis

### Decentralised Storage Integration
- Persistent analysis storage on Walrus network
- Intelligent caching with change-based storage optimisation
- Historical data access for long-term pattern tracking
- Cost-effective storage with configurable retention policies

### Natural Language Trading Interface
- Five core MCP tools for comprehensive trading operations
- Claude/GPT integration for conversational trading commands
- Real-time pattern-based recommendation generation
- Automated trade execution through natural language

### Automated Trade Execution
- Direct integration with Cetus DEX smart contracts
- Configurable safety mechanisms and slippage protection (not yet implemented in this version since I used Cetus smart contracts directly - will configure custom Move smart contracts in next version with slippage protection, time sensitive executions and position sizing limits)
- Multi-network support with seamless environment switching (testnet <-> mainnet)

### Production-ready architecture
- Multi-network configuration (testnet/mainnet)
- Environment-aware deployment configuration
- Comprehensive error handling and recovery

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude/GPT    │◄──►│   MCP Server     │◄──►│ Pattern Engine  │
│  Natural Lang   │    │   5 Core Tools   │    │  AI Analysis    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Walrus Storage Network                      │
│  Persistent Analysis • Historical Data • Memory Management      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Sui Blockchain Network                       │
│  Live Swap Events • Cetus DEX • Trade Execution                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Processing Flow

1. **Real-time Data Collection**: Query Sui RPC endpoints for latest Cetus swap events
2. **Pattern Analysis**: AI-driven statistical analysis and behavioural pattern recognition
3. **Persistent Storage**: Intelligent caching on Walrus with deduplication optimisation
4. **Service Integration**: MCP tools provide structured access to Claude/GPT
5. **Natural Language Interface**: Conversational trading assistant capabilities
6. **Trade Execution**: Automated transaction processing with safety verification

## Project Structure

```
aitrader/
├── src/
│   ├── config/
│   │   └── networks.ts            # Multi-network configuration
│   └── mcp/
│       └── server.ts              # MCP server with integrated functionality
├── docs/
│   └── WALRUS_STORAGE.md          # Walrus integration documentation
├── claude-mcp-config.json         # MCP server configuration
├── .env.example                   # Environment configuration template
└── dist/                          # Compiled output
```

## Technology Stack

**Core Infrastructure:**
- Blockchain: Sui (multi-network support)
- Storage: Walrus decentralised storage network
- DEX Integration: Cetus CLMM protocol
- Runtime: Node.js/TypeScript
- AI Integration: Model Context Protocol

**Key Dependencies:**
- `@modelcontextprotocol/sdk` - MCP server framework
- `@mysten/sui.js` - Sui blockchain SDK
- `@mysten/walrus` - Walrus storage SDK
- `zod` - Runtime type validation

## Quick Start

### Prerequisites
- Node.js 18 or higher
- Claude Desktop (Pro/Team/Enterprise subscription)
- Sui wallet with testnet tokens

### Installation

```bash
git clone <repository-url>
cd aitrader
npm install
npm run build
```

### Environment Configuration

```bash
cp .env.example .env
npm run generate:keypair
# Add generated private key to .env file
npm run check:network
```

### Token Requirements

**For Testing:**
- SUI tokens: 1-2 SUI for transaction fees
- WAL tokens: 10-20 WAL for storage operations

Request tokens from hackathon organisers or use official faucets.

### Component Testing

```bash
# Build the project
npm run build

# Start MCP server (for testing)
node dist/mcp/server.js
```

### Claude Desktop Integration

Add configuration to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "trader-soul": {
      "command": "node",
      "args": ["/path/to/aitrader/dist/mcp/server.js"],
      "cwd": "/path/to/aitrader",
      "env": {
        "NETWORK": "testnet",
        "BUILDER_PRIVATE_KEY": "your_builder_private_key_here",
        "DEMO_PRIVATE_KEY": "your_user_private_key_here"
      }
    }
  }
}
```

Restart Claude Desktop and test with natural language commands.

## Available MCP Tools

| Tool | Function | Usage |
|------|----------|-------|
| `cetus_get_swap_history` | Retrieve raw trading data | Historical transaction analysis |
| `cetus_get_trading_patterns` | AI analysis with storage | Behavioral pattern discovery |
| `cetus_recommend_swaps` | Generate trading suggestions | AI-driven recommendations |
| `cetus_execute_trade` | Automated trade execution | Transaction processing |
| `cetus_get_cached_analysis` | Historical insight access | Long-term pattern analysis |
| `cetus_get_token_prices` | Real-time price data | Token price information |
| `cetus_get_active_pools` | Pool discovery | Active trading pools |
| `sui_get_balance` | Wallet balance check | Token balance queries |
| `sui_get_all_balances` | Complete balance overview | All token balances |
| `analysis_analyze_trading_patterns` | Pattern analysis | Trading behavior analysis |

## Network Configuration

**Environment Variables:**

```bash
# Network selection
NETWORK=testnet

# RPC endpoint configuration
SUI_RPC_URL=https://fullnode.testnet.sui.io:443

# Private keys for functionality
BUILDER_PRIVATE_KEY=your_builder_private_key_here
DEMO_PRIVATE_KEY=your_user_private_key_here

# Walrus storage configuration
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
```

**Supported Networks:**
- Testnet (development and testing)
- Mainnet (production deployment)

## Cost Structure

**Storage Operations:**
- Analysis storage: 1-2 WAL per analysis (10 epochs)
- Transaction fees: 0.01-0.02 SUI per operation
- Optimisation: Smart caching reduces redundant storage

**Trade Execution:**
- Gas fees: 0.01-0.02 SUI per transaction
- Slippage protection: 3% default (configurable)
- Direct protocol integration (no platform fees)

## Use Cases

### Personal Trading Analysis
Comprehensive analysis of individual trading behaviour with persistent storage and historical tracking.

### Automated Trade Execution
Natural language trading commands with intelligent recommendation generation and automated execution.

### Research and Strategy Development
Institutional-grade analysis tools for trading strategy research and backtesting capabilities.

### Portfolio Management
Advanced analytics for portfolio optimisation and risk management across multiple timeframes.

## Production Deployment

**Infrastructure Requirements:**
- Multi-network configuration support
- Persistent storage with Walrus integration
- Automated failover and error recovery
- Comprehensive logging and monitoring

**Security Considerations:**
- Private key management and rotation
- Transaction validation and verification
- Network isolation and access controls
- Audit logging for all operations

## Development Status

**Completed Features:**
- Multi-network configuration and deployment
- Walrus storage integration with optimisation
- Trade execution with safety mechanisms
- Comprehensive error handling
- Production-ready configuration management

**Future Development:**
- Advanced ML models for enhanced pattern recognition
- Custom Move smart contracts with enhanced slippage protection
- Additional DEX protocol integrations
- Cross-chain analysis capabilities
- Enhanced risk management features

## Contributing

This project was developed for the Sui-mming Hackathon 2025. Contributions are welcome in the following areas:

- Machine learning model development
- Additional protocol integrations
- User interface development
- Performance optimisation

## License

MIT License - see LICENSE file for complete terms.

---

**Project Vision**: Building the next generation of AI-powered trading infrastructure that combines blockchain technology, decentralised storage, and artificial intelligence to create autonomous trading systems with persistent memory and natural language interaction capabilities.