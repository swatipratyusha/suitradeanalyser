/**
 * Main pattern analyzer for trading behavior analysis
 * Analyzes swap-only patterns without requiring external price data
 */

import { SwapEvent } from '../sui/client.js';
import {
  mean, median, getBasicStats, getFrequencyDistribution,
  calculateHerfindahlIndex, getTimePeriod, formatPercentage,
  DAY_NAMES, formatHour
} from './statistics.js';
import {
  getPoolDisplayName, getTokensFromPool, analyzeTokenPreferences,
  analyzePoolPreferences, convertToSuiEquivalent, getSwapDirection,
  categorizeTokens, formatSuiEquivalent
} from './token-utils.js';

export interface TradingPatterns {
  wallet: string;
  analysisDate: string;
  dataQuality: {
    totalSwaps: number;
    timeRange: string;
    dataConfidence: 'low' | 'medium' | 'high';
  };
  tokenPreferences: {
    favoriteTokens: Array<{ token: string; percentage: number }>;
    diversification: number; // 0-1, lower = more diversified
    tokenCategories: {
      major: number; // percentage
      defi: number;
      other: number;
    };
  };
  poolPreferences: {
    favoritePools: Array<{ displayName: string; percentage: number }>;
    poolCount: number;
  };
  tradingSizing: {
    averageTradeSize: string;
    typicalRange: string;
    consistency: 'very_consistent' | 'consistent' | 'varied' | 'highly_varied';
  };
  tradingRhythm: {
    frequency: string;
    averageTimeBetweenTrades: string;
    tradingStyle: 'high_frequency' | 'active' | 'moderate' | 'occasional';
  };
  timingPatterns: {
    mostActiveHour: string;
    mostActiveDay: string;
    timeDistribution: Array<{ period: string; percentage: number }>;
  };
  tradingPersonality: string;
  keyInsights: string[];
}

export class SwapPatternAnalyzer {
  analyzePatterns(wallet: string, swaps: SwapEvent[]): TradingPatterns {
    if (swaps.length === 0) {
      return this.getEmptyPatterns(wallet);
    }

    const dataQuality = this.assessDataQuality(swaps);
    const tokenPreferences = this.analyzeTokenPreferences(swaps);
    const poolPreferences = this.analyzePoolPreferences(swaps);
    const tradingSizing = this.analyzeTradeSizing(swaps);
    const tradingRhythm = this.analyzeTradingRhythm(swaps);
    const timingPatterns = this.analyzeTimingPatterns(swaps);

    const tradingPersonality = this.determineTradingPersonality({
      tokenPreferences,
      tradingSizing,
      tradingRhythm,
      timingPatterns
    });

    const keyInsights = this.generateKeyInsights({
      tokenPreferences,
      poolPreferences,
      tradingSizing,
      tradingRhythm,
      timingPatterns,
      dataQuality
    });

    return {
      wallet,
      analysisDate: new Date().toISOString(),
      dataQuality,
      tokenPreferences,
      poolPreferences,
      tradingSizing,
      tradingRhythm,
      timingPatterns,
      tradingPersonality,
      keyInsights
    };
  }

  private assessDataQuality(swaps: SwapEvent[]) {
    const timePeriod = getTimePeriod(swaps.map(s => s.timestamp));

    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (swaps.length >= 50) confidence = 'high';
    else if (swaps.length >= 20) confidence = 'medium';

    return {
      totalSwaps: swaps.length,
      timeRange: timePeriod.days > 1 ?
        `${timePeriod.days.toFixed(0)} days` :
        `${timePeriod.hours.toFixed(1)} hours`,
      dataConfidence: confidence
    };
  }

  private analyzeTokenPreferences(swaps: SwapEvent[]) {
    const poolIds = swaps.map(s => s.pool);
    const tokenPrefs = analyzeTokenPreferences(poolIds);

    // Get all unique tokens
    const allTokens = Array.from(new Set(
      poolIds.flatMap(poolId => getTokensFromPool(poolId))
    ));

    const categories = categorizeTokens(allTokens);
    const totalTokens = allTokens.length;

    const diversification = calculateHerfindahlIndex(
      poolIds.flatMap(poolId => getTokensFromPool(poolId))
    );

    return {
      favoriteTokens: tokenPrefs.slice(0, 5).map(t => ({
        token: t.token,
        percentage: Math.round(t.percentage)
      })),
      diversification: Math.round((1 - diversification) * 100) / 100, // Convert to 0-1 scale
      tokenCategories: {
        major: Math.round((categories.major.length / totalTokens) * 100),
        defi: Math.round((categories.defi.length / totalTokens) * 100),
        other: Math.round((categories.other.length / totalTokens) * 100)
      }
    };
  }

  private analyzePoolPreferences(swaps: SwapEvent[]) {
    const poolIds = swaps.map(s => s.pool);
    const poolPrefs = analyzePoolPreferences(poolIds);

    return {
      favoritePools: poolPrefs.slice(0, 3).map(p => ({
        displayName: p.displayName,
        percentage: Math.round(p.percentage)
      })),
      poolCount: poolPrefs.length
    };
  }

  private analyzeTradeSizing(swaps: SwapEvent[]) {
    // Convert all amounts to SUI equivalent for comparison
    const tradeSizes = swaps.map(swap => {
      const poolInfo = getTokensFromPool(swap.pool);
      const direction = getSwapDirection(swap.pool, swap.atob);

      // Use the token being sold (amountIn) for trade size
      return convertToSuiEquivalent(swap.amountIn, direction.tokenIn);
    });

    const stats = getBasicStats(tradeSizes);
    const cv = stats.std / stats.mean;

    let consistency: 'very_consistent' | 'consistent' | 'varied' | 'highly_varied';
    if (cv < 0.3) consistency = 'very_consistent';
    else if (cv < 0.6) consistency = 'consistent';
    else if (cv < 1.0) consistency = 'varied';
    else consistency = 'highly_varied';

    return {
      averageTradeSize: `${stats.mean.toFixed(0)} SUI equiv`,
      typicalRange: `${Math.round(stats.mean * 0.7)}-${Math.round(stats.mean * 1.3)} SUI equiv`,
      consistency
    };
  }

  private analyzeTradingRhythm(swaps: SwapEvent[]) {
    if (swaps.length < 2) {
      return {
        frequency: 'Insufficient data',
        averageTimeBetweenTrades: 'N/A',
        tradingStyle: 'occasional' as const
      };
    }

    // Calculate time between trades
    const sortedSwaps = [...swaps].sort((a, b) => a.timestamp - b.timestamp);
    const timeBetween: number[] = [];

    for (let i = 1; i < sortedSwaps.length; i++) {
      const hoursDiff = (sortedSwaps[i].timestamp - sortedSwaps[i-1].timestamp) / (1000 * 60 * 60);
      timeBetween.push(hoursDiff);
    }

    const avgHoursBetween = mean(timeBetween);
    const avgDaysBetween = avgHoursBetween / 24;

    let tradingStyle: 'high_frequency' | 'active' | 'moderate' | 'occasional';
    if (avgDaysBetween < 0.5) tradingStyle = 'high_frequency'; // < 12 hours
    else if (avgDaysBetween < 2) tradingStyle = 'active'; // < 2 days
    else if (avgDaysBetween < 7) tradingStyle = 'moderate'; // < 1 week
    else tradingStyle = 'occasional';

    return {
      frequency: `${swaps.length} swaps over ${this.formatDuration(avgDaysBetween * (swaps.length - 1))} days`,
      averageTimeBetweenTrades: avgDaysBetween < 1 ?
        `${avgHoursBetween.toFixed(1)} hours` :
        `${avgDaysBetween.toFixed(1)} days`,
      tradingStyle
    };
  }

  private analyzeTimingPatterns(swaps: SwapEvent[]) {
    const hours = swaps.map(s => new Date(s.timestamp).getUTCHours());
    const days = swaps.map(s => new Date(s.timestamp).getUTCDay());

    const hourDistribution = getFrequencyDistribution(hours);
    const dayDistribution = getFrequencyDistribution(days);

    const mostActiveHour = hourDistribution[0]?.value ?? 0;
    const mostActiveDay = dayDistribution[0]?.value ?? 0;

    // Group hours into periods
    const periods = hours.map(hour => {
      if (hour >= 0 && hour < 6) return 'Late Night (0-6 UTC)';
      if (hour >= 6 && hour < 12) return 'Morning (6-12 UTC)';
      if (hour >= 12 && hour < 18) return 'Afternoon (12-18 UTC)';
      return 'Evening (18-24 UTC)';
    });

    const periodDistribution = getFrequencyDistribution(periods);

    return {
      mostActiveHour: formatHour(mostActiveHour),
      mostActiveDay: DAY_NAMES[mostActiveDay],
      timeDistribution: periodDistribution.map(p => ({
        period: p.value,
        percentage: Math.round(p.percentage)
      }))
    };
  }

  private determineTradingPersonality(analysis: any): string {
    const { tokenPreferences, tradingSizing, tradingRhythm } = analysis;

    // Determine base personality from trading frequency
    let base = '';
    switch (tradingRhythm.tradingStyle) {
      case 'high_frequency':
        base = 'High-Frequency';
        break;
      case 'active':
        base = 'Active';
        break;
      case 'moderate':
        base = 'Moderate';
        break;
      default:
        base = 'Occasional';
    }

    // Add token preference modifier
    const favoriteToken = tokenPreferences.favoriteTokens[0]?.token || 'Token';
    const majorsPercentage = tokenPreferences.tokenCategories.major;

    if (majorsPercentage >= 80) {
      return `${base} ${favoriteToken} Trader (Major Token Focus)`;
    } else if (tokenPreferences.tokenCategories.defi >= 30) {
      return `${base} DeFi Trader (${favoriteToken} + Protocol Tokens)`;
    } else {
      return `${base} Diversified Trader (${favoriteToken} Primary)`;
    }
  }

  private generateKeyInsights(analysis: any): string[] {
    const insights: string[] = [];
    const { tokenPreferences, poolPreferences, tradingSizing, tradingRhythm, timingPatterns, dataQuality } = analysis;

    // Token insights
    const topToken = tokenPreferences.favoriteTokens[0];
    if (topToken) {
      insights.push(`Prefers trading ${topToken.token} (${topToken.percentage}% of trades)`);
    }

    // Pool insights
    const topPool = poolPreferences.favoritePools[0];
    if (topPool) {
      insights.push(`Most active in ${topPool.displayName} pool (${topPool.percentage}% of trades)`);
    }

    // Sizing insights
    insights.push(`Typical trade size: ${tradingSizing.averageTradeSize} (${tradingSizing.consistency})`);

    // Rhythm insights
    if (tradingRhythm.tradingStyle === 'high_frequency') {
      insights.push(`Very active trader - ${tradingRhythm.averageTimeBetweenTrades} between trades`);
    } else {
      insights.push(`${tradingRhythm.tradingStyle} trading pace - ${tradingRhythm.averageTimeBetweenTrades} between trades`);
    }

    // Timing insights
    const topPeriod = timingPatterns.timeDistribution[0];
    if (topPeriod) {
      insights.push(`Most active during ${topPeriod.period} (${topPeriod.percentage}% of trades)`);
    }

    // Data quality warning
    if (dataQuality.dataConfidence === 'low') {
      insights.push(`⚠️ Limited data (${dataQuality.totalSwaps} swaps) - patterns may not be representative`);
    }

    return insights;
  }

  private formatDuration(days: number): string {
    if (days < 1) return (days * 24).toFixed(1);
    return days.toFixed(1);
  }

  private getEmptyPatterns(wallet: string): TradingPatterns {
    return {
      wallet,
      analysisDate: new Date().toISOString(),
      dataQuality: {
        totalSwaps: 0,
        timeRange: 'No data',
        dataConfidence: 'low'
      },
      tokenPreferences: {
        favoriteTokens: [],
        diversification: 0,
        tokenCategories: { major: 0, defi: 0, other: 0 }
      },
      poolPreferences: {
        favoritePools: [],
        poolCount: 0
      },
      tradingSizing: {
        averageTradeSize: 'No data',
        typicalRange: 'No data',
        consistency: 'varied'
      },
      tradingRhythm: {
        frequency: 'No trades found',
        averageTimeBetweenTrades: 'N/A',
        tradingStyle: 'occasional'
      },
      timingPatterns: {
        mostActiveHour: 'N/A',
        mostActiveDay: 'N/A',
        timeDistribution: []
      },
      tradingPersonality: 'No Trading Activity Detected',
      keyInsights: ['No swap activity found for this wallet']
    };
  }
}

export const patternAnalyzer = new SwapPatternAnalyzer();