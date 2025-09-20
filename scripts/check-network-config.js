#!/usr/bin/env node

/**
 * Network configuration checker and switcher
 */

const { getNetworkConfig, validateNetworkConfig, NETWORK_CONFIGS } = require('../dist/config/networks.js');

function displayNetworkInfo() {
  console.log('🌐 Network Configuration Status\n');

  try {
    const config = getNetworkConfig();
    const validation = validateNetworkConfig(config);

    console.log(`📍 Current Network: ${config.name.toUpperCase()}`);
    console.log(`🔗 RPC URL: ${config.rpcUrl}`);
    console.log(`💾 Walrus Network: ${config.walrusNetwork}`);
    console.log(`📦 Cetus Package: ${config.cetusPackageId.slice(0, 16)}...`);

    if (validation.valid) {
      console.log('✅ Configuration is valid\n');
    } else {
      console.log('❌ Configuration issues:');
      validation.errors.forEach(error => console.log(`   • ${error}`));
      console.log('');
    }

    // Show token addresses
    console.log('🪙 Common Tokens:');
    Object.entries(config.commonTokens).forEach(([name, address]) => {
      console.log(`   ${name}: ${address.slice(0, 20)}...`);
    });

    // Show faucets if available
    if (config.faucets) {
      console.log('\n🚿 Faucets:');
      Object.entries(config.faucets).forEach(([name, url]) => {
        console.log(`   ${name}: ${url}`);
      });
    }

  } catch (error) {
    console.error('❌ Error getting network config:', error.message);
  }
}

function showAvailableNetworks() {
  console.log('\n🌍 Available Networks:\n');

  Object.entries(NETWORK_CONFIGS).forEach(([name, config]) => {
    console.log(`${name.toUpperCase()}:`);
    console.log(`   RPC: ${config.rpcUrl}`);
    console.log(`   Walrus: ${config.walrusNetwork}`);
    console.log('');
  });

  console.log('💡 To switch networks:');
  console.log('   1. Set SUI_NETWORK=mainnet in .env');
  console.log('   2. Or change SUI_RPC_URL for auto-detection');
}

function main() {
  const command = process.argv[2];

  switch (command) {
    case 'list':
    case 'networks':
      showAvailableNetworks();
      break;
    case 'check':
    case undefined:
    default:
      displayNetworkInfo();
      break;
  }
}

if (require.main === module) {
  main();
}