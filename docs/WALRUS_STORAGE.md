# Walrus Storage Integration

This document explains how the Sui Trading Analysis project integrates with Walrus for decentralized storage of trading patterns and analysis data.

## Overview

The integration provides:
- **Persistent analysis storage** on Walrus decentralized storage
- **Smart caching** to avoid redundant storage operations
- **Retrieval capabilities** for historical analysis data
- **Cost-effective storage** with configurable retention periods

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MCP Tools     │◄──►│ Storage Client   │◄──►│ Walrus Network  │
│  (Enhanced)     │    │   Smart Cache    │    │  Blob Storage   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Sui Blockchain │
                       │    Metadata      │
                       └──────────────────┘
```

## Storage Schema

### StoredAnalysis
```typescript
interface StoredAnalysis {
  id: string;                    // Unique analysis identifier
  wallet: string;                // Wallet address analyzed
  analysis: TradingPatterns;     // Full pattern analysis
  storedAt: string;              // Storage timestamp
  version: string;               // Schema version
  metadata: {
    dataHash: string;            // Content hash for deduplication
    swapCount: number;           // Number of swaps analyzed
    confidenceLevel: string;     // Analysis confidence
    blobId?: string;             // Walrus blob identifier
  };
}
```

### AnalysisCache
```typescript
interface AnalysisCache {
  wallet: string;                // Wallet being tracked
  lastAnalysis?: StoredAnalysis; // Most recent analysis
  historicalAnalyses: StoredAnalysis[]; // Historical data
  aggregatedInsights?: {         // Cross-time insights
    tradingEvolution: string[];
    consistencyScore: number;
    improvementAreas: string[];
  };
}
```

## Usage

### 1. Configuration

Set up environment variables:
```bash
# Copy and configure
cp .env.example .env

# Add your demo keypair (testnet only!)
DEMO_PRIVATE_KEY=your_ed25519_private_key
WALRUS_NETWORK=testnet
WALRUS_EPOCHS=10
```

### 2. Storage Operations

The storage client provides several methods:

#### Store Analysis
```typescript
const storage = new TradingAnalysisStorage();
const storedAnalysis = await storage.storeAnalysis(wallet, patterns);
console.log(`Stored at blob: ${storedAnalysis.metadata.blobId}`);
```

#### Smart Storage (Recommended)
```typescript
// Only stores if significant changes detected
const result = await storage.smartStoreAnalysis(wallet, patterns, existingAnalysis);
if (result.stored) {
  console.log('New analysis stored');
} else {
  console.log('Using existing analysis');
}
```

#### Retrieve Analysis
```typescript
const analysis = await storage.getAnalysis(blobId);
if (analysis) {
  console.log(`Retrieved analysis for: ${analysis.wallet}`);
}
```

### 3. MCP Tool Integration

The MCP server now includes Walrus storage capabilities:

#### Enhanced Pattern Analysis
```bash
# Claude Desktop command
"Analyze trading patterns for wallet 0xabc... (with caching)"
```

This tool:
1. Fetches fresh swap data from Sui
2. Analyzes trading patterns
3. Checks if analysis differs significantly from cached version
4. Stores on Walrus if changes detected
5. Returns analysis with storage information

#### Cached Analysis Retrieval
```bash
# Claude Desktop command
"Retrieve cached analysis from Walrus blob abc123..."
```

Directly fetches stored analysis from Walrus without re-computation.

## Testing

### Run Storage Tests
```bash
# Test the complete storage workflow
npm run test:walrus

# Or directly
ts-node scripts/test-walrus-storage.ts
```

The test script:
1. Analyzes a test wallet's trading patterns
2. Stores the analysis on Walrus
3. Retrieves and verifies the stored data
4. Tests smart storage deduplication

### Test Requirements

- **SUI tokens** for transaction fees
- **WAL tokens** for storage costs
- **Testnet access** (recommended for testing)

Get testnet tokens:
- SUI: [Sui Faucet](https://docs.sui.io/guides/developer/getting-sui)
- WAL: Walrus testnet faucet (check Walrus docs)

## Production Considerations

### Security
- **Never commit private keys** to version control
- Use **proper key management** (hardware wallets, KMS)
- Consider **multi-sig setups** for production

### Cost Management
- **Configure epochs** based on data retention needs
- Use **smart storage** to avoid redundant operations
- Monitor **storage costs** and optimize accordingly

### Performance
- **Batch operations** when possible
- **Cache blob IDs** for faster retrieval
- Consider **local caching** for frequently accessed data

## Storage Costs

Walrus storage costs depend on:
- **Blob size** (analysis data is typically 5-15KB)
- **Storage duration** (epochs configuration)
- **Network congestion** (gas fees)

Example costs (testnet):
- 1 epoch ≈ 24 hours
- 10KB analysis ≈ 0.1 WAL per epoch
- Annual storage ≈ 36.5 WAL tokens

## Error Handling

Common issues and solutions:

### Insufficient Tokens
```
Error: insufficient WAL balance for storage
```
**Solution**: Fund your keypair with WAL tokens from the faucet

### Network Issues
```
Error: failed to connect to Walrus network
```
**Solution**: Check network connectivity and Walrus service status

### Invalid Blob ID
```
Error: blob not found
```
**Solution**: Verify the blob ID and ensure data hasn't expired

## Integration with Claude

When using Claude Desktop with MCP integration:

1. **Pattern Analysis**: Automatically stores results on Walrus
2. **Cost Awareness**: Reports storage operations and blob IDs
3. **Cache Utilization**: Uses stored data when appropriate
4. **Historical Access**: Can retrieve and compare past analyses

Example Claude interactions:
```
User: "Analyze my trading patterns"
Claude: "Analysis complete! Stored on Walrus (Blob: abc123...)
         Your trading style: High-Frequency SUI Trader"

User: "Show me my analysis from last week"
Claude: "Retrieving from Walrus blob def456..."
```

## Future Enhancements

Planned improvements:
- **Cross-wallet analytics** storage
- **Encrypted sensitive data** support
- **Automatic expiration** management
- **Performance analytics** dashboard
- **Storage cost optimization** algorithms

## Support

For issues related to Walrus integration:
1. Check the [test script output](#testing) for diagnostics
2. Verify [token balances](#test-requirements)
3. Review [error handling](#error-handling) section
4. Open an issue with full error logs