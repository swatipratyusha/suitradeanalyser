#!/usr/bin/env ts-node

/**
 * Generate a keypair for Walrus testing
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

function generateKeypair() {
  console.log('🔑 Generating new Ed25519 keypair for testing...\n');

  // Generate new keypair
  const keypair = new Ed25519Keypair();

  // Get address and private key
  const address = keypair.toSuiAddress();
  const privateKey = keypair.getSecretKey();

  console.log('✅ Keypair generated successfully!');
  console.log('\n📋 Details:');
  console.log(`   Address: ${address}`);
  console.log(`   Private Key: ${privateKey}`);

  console.log('\n🚀 Next Steps:');
  console.log('1. Add this to your .env file:');
  console.log(`   DEMO_PRIVATE_KEY=${privateKey}`);

  console.log('\n2. Get testnet tokens:');
  console.log(`   • SUI tokens: https://docs.sui.io/guides/developer/getting-sui`);
  console.log(`   • WAL tokens: Check Walrus testnet documentation`);

  console.log('\n3. Fund your address:');
  console.log(`   ${address}`);

  return { address, privateKey };
}

// Run if called directly
if (require.main === module) {
  generateKeypair();
}