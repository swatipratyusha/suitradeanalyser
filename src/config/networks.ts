/**
 * Network configuration for modular testnet/mainnet switching
 */

export type SuiNetwork = 'testnet' | 'mainnet' | 'devnet' | 'localnet';

export interface NetworkConfig {
  name: SuiNetwork;
  rpcUrl: string;
  walrusNetwork: 'testnet' | 'mainnet';
  cetusPackageId: string;
  cetusGlobalConfig: string;
  commonTokens: {
    SUI: string;
    USDC: string;
    USDT: string;
    CETUS: string;
    DEEP: string;
  };
  faucets?: {
    sui?: string;
    wal?: string;
  };
}

export const NETWORK_CONFIGS: Record<SuiNetwork, NetworkConfig> = {
  testnet: {
    name: 'testnet',
    rpcUrl: 'https://fullnode.testnet.sui.io:443',
    walrusNetwork: 'testnet',
    cetusPackageId: '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb', // Testnet package
    cetusGlobalConfig: '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f', // Testnet global config
    commonTokens: {
      SUI: '0x2::sui::SUI',
      USDC: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
      USDT: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
      CETUS: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
      DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
    },
    faucets: {
      sui: 'https://docs.sui.io/guides/developer/getting-started/get-coins',
      wal: 'Contact hackathon organizers or check Walrus docs',
    },
  },

  mainnet: {
    name: 'mainnet',
    rpcUrl: 'https://fullnode.mainnet.sui.io:443',
    walrusNetwork: 'mainnet',
    cetusPackageId: '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb', // Mainnet package
    cetusGlobalConfig: '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f', // Mainnet global config
    commonTokens: {
      SUI: '0x2::sui::SUI',
      USDC: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
      USDT: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
      CETUS: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
      DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
    },
  },

  devnet: {
    name: 'devnet',
    rpcUrl: 'https://fullnode.devnet.sui.io:443',
    walrusNetwork: 'testnet', // Use testnet Walrus for devnet
    cetusPackageId: '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb', // Devnet package
    cetusGlobalConfig: '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f',
    commonTokens: {
      SUI: '0x2::sui::SUI',
      USDC: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
      USDT: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
      CETUS: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
      DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
    },
  },

  localnet: {
    name: 'localnet',
    rpcUrl: 'http://127.0.0.1:9000',
    walrusNetwork: 'testnet', // Use testnet Walrus for local
    cetusPackageId: '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb', // Local package
    cetusGlobalConfig: '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f',
    commonTokens: {
      SUI: '0x2::sui::SUI',
      USDC: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
      USDT: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
      CETUS: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
      DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
    },
  },
};

/**
 * Detect network from RPC URL
 */
export function detectNetworkFromRpcUrl(rpcUrl: string): SuiNetwork {
  const url = rpcUrl.toLowerCase();

  if (url.includes('testnet')) return 'testnet';
  if (url.includes('mainnet')) return 'mainnet';
  if (url.includes('devnet')) return 'devnet';
  if (url.includes('localhost') || url.includes('127.0.0.1')) return 'localnet';

  // Default to testnet for safety
  console.warn(`Unknown RPC URL pattern: ${rpcUrl}. Defaulting to testnet.`);
  return 'testnet';
}

/**
 * Get network configuration from environment or RPC URL
 */
export function getNetworkConfig(): NetworkConfig {
  // 1. Try explicit network from environment
  const explicitNetwork = process.env.SUI_NETWORK as SuiNetwork;
  if (explicitNetwork && NETWORK_CONFIGS[explicitNetwork]) {
    console.log(`🌐 Using explicit network: ${explicitNetwork}`);
    return NETWORK_CONFIGS[explicitNetwork];
  }

  // 2. Try to detect from RPC URL
  const rpcUrl = process.env.SUI_RPC_URL || process.env.SUI_TESTNET_RPC_URL;
  if (rpcUrl) {
    const detectedNetwork = detectNetworkFromRpcUrl(rpcUrl);
    console.log(`🌐 Detected network from RPC URL: ${detectedNetwork}`);

    // Override RPC URL with environment value
    const config = { ...NETWORK_CONFIGS[detectedNetwork] };
    config.rpcUrl = rpcUrl;
    return config;
  }

  // 3. Default to testnet
  console.log(`🌐 No network specified, defaulting to testnet`);
  return NETWORK_CONFIGS.testnet;
}

/**
 * Validate network configuration
 */
export function validateNetworkConfig(config: NetworkConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.rpcUrl) errors.push('Missing RPC URL');
  if (!config.cetusPackageId) errors.push('Missing Cetus package ID');
  if (!config.commonTokens.SUI) errors.push('Missing SUI token address');

  // Validate URL format
  try {
    new URL(config.rpcUrl);
  } catch {
    errors.push('Invalid RPC URL format');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get environment-specific configuration overrides
 */
export function getEnvironmentOverrides(): Partial<NetworkConfig> {
  const overrides: Partial<NetworkConfig> = {};

  // Override RPC URL if specified
  if (process.env.SUI_RPC_URL) {
    overrides.rpcUrl = process.env.SUI_RPC_URL;
  }

  // Override Walrus network if specified
  if (process.env.WALRUS_NETWORK) {
    overrides.walrusNetwork = process.env.WALRUS_NETWORK as 'testnet' | 'mainnet';
  }

  // Override Cetus package if specified
  if (process.env.CETUS_PACKAGE_ID) {
    overrides.cetusPackageId = process.env.CETUS_PACKAGE_ID;
  }

  return overrides;
}