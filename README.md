# Trader Soul - Personalized AI Trading Assistant for Sui

*Built for Sui-mming Hackathon 2025*

## 🚀 Project Overview

Trader Soul creates a personalized AI trading assistant that learns from your historical trading patterns on Sui and provides intelligent trade recommendations through Claude/GPT integration. Every wallet develops its own evolving "Trader Soul" - a persistent memory object that understands your trading style.

## 🎯 Key Features

- **Memory Engine**: Learns your trading patterns from on-chain history (Cetus, Aftermath, Turbos)
- **AI Integration**: Claude/GPT access via Model Context Protocol (MCP)
- **Personalized Recommendations**: Trade suggestions based on your historical playbooks
- **Sui-Native Storage**: Uses Walrus for data storage and Seal for encryption
- **Pattern Recognition**: Discovers your trading styles (momentum, mean-reversion, risk preferences)
- **Real-time Context**: Live market data from Pyth oracles and DEX APIs

## 🏗 Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude/GPT    │◄──►│   MCP Provider   │◄──►│  Memory Engine  │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Sui Blockchain Layer                        │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  Trader Soul    │     Walrus      │         Pyth Oracle         │
│    Objects      │   (Storage)     │      (Price Feeds)          │
└─────────────────┴─────────────────┴─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              DEX/Perps Data Sources                            │
│          Cetus • Aftermath • Turbos                           │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
trader-soul/
├── README.md
├── package.json
├── .env.example
├── src/
│   ├── indexer/          # Sui event indexing & data collection
│   │   ├── sui-client.ts
│   │   ├── event-parser.ts
│   │   └── protocols/
│   │       ├── cetus.ts
│   │       ├── aftermath.ts
│   │       └── turbos.ts
│   ├── memory/           # Trading pattern analysis & ML
│   │   ├── pattern-detector.ts
│   │   ├── playbook-extractor.ts
│   │   ├── risk-profiler.ts
│   │   └── embeddings.ts
│   ├── storage/          # Walrus & Seal integration
│   │   ├── walrus-client.ts
│   │   ├── seal-client.ts
│   │   └── trader-soul.ts
│   ├── mcp/              # Model Context Protocol provider
│   │   ├── server.ts
│   │   ├── tools/
│   │   │   ├── wallet-summary.ts
│   │   │   ├── trade-history.ts
│   │   │   ├── trade-memory.ts
│   │   │   ├── market-snapshot.ts
│   │   │   └── recommend-trades.ts
│   │   └── schemas.ts
│   ├── recommender/      # Trade recommendation engine
│   │   ├── candidate-scanner.ts
│   │   ├── pattern-matcher.ts
│   │   ├── risk-manager.ts
│   │   └── explanation-generator.ts
│   ├── api/              # REST API endpoints
│   │   ├── server.ts
│   │   └── routes/
│   └── web/              # Frontend interface
│       ├── components/
│       ├── pages/
│       └── utils/
├── contracts/            # Sui Move contracts
│   ├── trader_soul/
│   │   ├── Move.toml
│   │   └── sources/
│   │       └── trader_soul.move
└── docs/
    ├── API.md
    ├── MCP-INTEGRATION.md
    └── SETUP.md
```

## 🛠 Tech Stack

- **Blockchain**: Sui (Move smart contracts)
- **Storage**: Walrus (data blobs), Seal (encryption)
- **Oracles**: Pyth Network
- **Backend**: Node.js/TypeScript
- **ML**: TensorFlow.js / Simple statistical models
- **MCP**: Model Context Protocol server
- **Frontend**: Next.js/React
- **Database**: PostgreSQL (for indexed data)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Sui CLI
- PostgreSQL
- Walrus CLI (for storage)

### Installation

```bash
# Clone and setup
git clone <repo-url>
cd trader-soul
npm install

# Setup environment
cp .env.example .env
# Fill in your Sui RPC, Walrus, and other API keys

# Setup database
npm run db:setup

# Start development
npm run dev
```

### MCP Integration with Claude

```bash
# Start MCP server
npm run mcp:serve

# In Claude Desktop, add to config:
{
  "mcpServers": {
    "trader-soul": {
      "command": "node",
      "args": ["dist/mcp/server.js"],
      "env": {
        "SUI_RPC_URL": "https://fullnode.mainnet.sui.io:443"
      }
    }
  }
}
```

## 📊 Demo Usage

1. **Link Wallet**: Connect your Sui wallet(s)
2. **Historical Analysis**: System analyzes your past trades on Cetus/Aftermath
3. **Pattern Discovery**: Identifies your trading playbooks and risk preferences
4. **Claude Integration**: Ask Claude about your trading style
5. **Get Recommendations**: "Claude, what should I trade today based on my history?"

## 🎯 Hackathon Goals

- [x] Sui event indexing for major DEXes
- [ ] Trading pattern recognition ML
- [ ] Walrus storage integration
- [ ] MCP provider implementation
- [ ] Claude/GPT integration demo
- [ ] Basic web interface
- [ ] Live recommendation engine

## 🔮 Future Roadmap

- Cross-chain analysis (Ethereum, Solana)
- Advanced ML models (transformer-based)
- Portfolio optimization suggestions
- Social trading features
- Mobile app

## 🤝 Contributing

Built for Sui-mming Hackathon 2025. Open to collaboration and feedback!

## 📄 License

MIT License - see LICENSE file for details.

---

*"Every wallet deserves a memory. Every trader deserves personalized intelligence."*