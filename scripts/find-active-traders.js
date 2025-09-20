#!/usr/bin/env node

/**
 * Script to find the most active Cetus traders on Sui
 * Queries swap events and ranks wallets by trading volume
 */

const https = require('https');

// Sui mainnet RPC endpoint
const SUI_RPC_URL = 'https://fullnode.mainnet.sui.io:443';

// Cetus contract addresses
const CETUS_CLMM_PACKAGE = '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb';

// Helper function to make RPC calls
async function suiRpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: method,
      params: params
    });

    const options = {
      hostname: 'fullnode.mainnet.sui.io',
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.error) {
            reject(new Error(`RPC Error: ${parsed.error.message}`));
          } else {
            resolve(parsed.result);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

// Get swap events from Cetus
async function getCetusSwapEvents(cursor = null, limit = 50) {
  try {
    console.log(`Fetching ${limit} events...`);

    const params = [
      {
        "MoveEventType": `${CETUS_CLMM_PACKAGE}::pool::SwapEvent`
      },
      cursor,
      limit,
      true // descending order
    ];

    const result = await suiRpcCall('suix_queryEvents', params);
    return result;
  } catch (error) {
    console.error('Error fetching events:', error.message);
    return null;
  }
}

// Count swaps per wallet
function countSwapsByWallet(events) {
  const walletCounts = {};
  const walletLastSeen = {};

  events.forEach(event => {
    const sender = event.sender;
    const timestamp = event.timestampMs;

    if (!walletCounts[sender]) {
      walletCounts[sender] = 0;
      walletLastSeen[sender] = timestamp;
    }

    walletCounts[sender]++;

    // Keep track of most recent activity
    if (timestamp > walletLastSeen[sender]) {
      walletLastSeen[sender] = timestamp;
    }
  });

  return { walletCounts, walletLastSeen };
}

// Main function to find active traders
async function findActiveTraders() {
  console.log('🔍 Finding most active Cetus traders...\n');

  let allEvents = [];
  let cursor = null;
  let totalFetched = 0;
  const maxEvents = 2000; // Fetch up to 2000 events

  // Fetch events in batches
  while (totalFetched < maxEvents) {
    const batchSize = Math.min(50, maxEvents - totalFetched);
    const result = await getCetusSwapEvents(cursor, batchSize);

    if (!result || !result.data || result.data.length === 0) {
      console.log('No more events to fetch');
      break;
    }

    allEvents = allEvents.concat(result.data);
    totalFetched += result.data.length;
    cursor = result.nextCursor;

    console.log(`Fetched ${totalFetched} events so far...`);

    if (!cursor) {
      console.log('Reached end of events');
      break;
    }

    // Add small delay to be nice to the RPC
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n📊 Analyzing ${allEvents.length} swap events...\n`);

  // Count swaps per wallet
  const { walletCounts, walletLastSeen } = countSwapsByWallet(allEvents);

  // Sort wallets by swap count
  const sortedWallets = Object.entries(walletCounts)
    .map(([wallet, count]) => ({
      wallet,
      swapCount: count,
      lastSeen: new Date(parseInt(walletLastSeen[wallet])).toISOString().split('T')[0]
    }))
    .sort((a, b) => b.swapCount - a.swapCount);

  // Display top traders
  console.log('🏆 TOP CETUS TRADERS (by swap count):');
  console.log('==========================================');

  sortedWallets.slice(0, 20).forEach((trader, index) => {
    console.log(`${index + 1}. ${trader.wallet}`);
    console.log(`   Swaps: ${trader.swapCount} | Last seen: ${trader.lastSeen}`);
    console.log('');
  });

  // Find traders with 1000+ swaps
  const highVolumeTraders = sortedWallets.filter(t => t.swapCount >= 1000);

  if (highVolumeTraders.length > 0) {
    console.log('\n🎯 HIGH VOLUME TRADERS (1000+ swaps):');
    console.log('=====================================');
    highVolumeTraders.forEach(trader => {
      console.log(`${trader.wallet} - ${trader.swapCount} swaps`);
    });
  } else {
    console.log('\n⚠️  No wallets found with 1000+ swaps in recent data');
    console.log('Try increasing the maxEvents limit or use testnet data');
  }

  // Summary
  console.log('\n📈 SUMMARY:');
  console.log(`Total unique traders: ${sortedWallets.length}`);
  console.log(`Events analyzed: ${allEvents.length}`);
  console.log(`Traders with 100+ swaps: ${sortedWallets.filter(t => t.swapCount >= 100).length}`);
  console.log(`Traders with 500+ swaps: ${sortedWallets.filter(t => t.swapCount >= 500).length}`);
  console.log(`Traders with 1000+ swaps: ${highVolumeTraders.length}`);
}

// Run the script
findActiveTraders().catch(console.error);