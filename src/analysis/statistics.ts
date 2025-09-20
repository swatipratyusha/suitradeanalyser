/**
 * Statistical utility functions for trading pattern analysis
 */

export interface BasicStats {
  mean: number;
  median: number;
  mode: number | null;
  min: number;
  max: number;
  std: number;
  count: number;
}

export interface FrequencyMap<T> {
  [key: string]: number;
}

/**
 * Calculate mean (average) of numbers
 */
export function mean(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
}

/**
 * Calculate median (middle value) of numbers
 */
export function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;

  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Find mode (most frequent value) of numbers
 */
export function mode(numbers: number[]): number | null {
  if (numbers.length === 0) return null;

  const frequency: FrequencyMap<number> = {};
  let maxCount = 0;
  let modeValue: number | null = null;

  for (const num of numbers) {
    frequency[num] = (frequency[num] || 0) + 1;
    if (frequency[num] > maxCount) {
      maxCount = frequency[num];
      modeValue = num;
    }
  }

  return modeValue;
}

/**
 * Get minimum value
 */
export function min(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return Math.min(...numbers);
}

/**
 * Get maximum value
 */
export function max(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return Math.max(...numbers);
}

/**
 * Calculate standard deviation
 */
export function standardDeviation(numbers: number[]): number {
  if (numbers.length === 0) return 0;

  const avg = mean(numbers);
  const squaredDiffs = numbers.map(num => Math.pow(num - avg, 2));
  const avgSquaredDiff = mean(squaredDiffs);

  return Math.sqrt(avgSquaredDiff);
}

/**
 * Calculate coefficient of variation (std dev / mean)
 * Useful for measuring consistency - lower = more consistent
 */
export function coefficientOfVariation(numbers: number[]): number {
  const avg = mean(numbers);
  if (avg === 0) return 0;

  const std = standardDeviation(numbers);
  return std / avg;
}

/**
 * Get percentile value
 */
export function percentile(numbers: number[], p: number): number {
  if (numbers.length === 0) return 0;
  if (p < 0 || p > 100) throw new Error('Percentile must be between 0 and 100');

  const sorted = [...numbers].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);

  if (Number.isInteger(index)) {
    return sorted[index];
  }

  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Get comprehensive basic statistics
 */
export function getBasicStats(numbers: number[]): BasicStats {
  return {
    mean: mean(numbers),
    median: median(numbers),
    mode: mode(numbers),
    min: min(numbers),
    max: max(numbers),
    std: standardDeviation(numbers),
    count: numbers.length,
  };
}

/**
 * Calculate frequency distribution
 */
export function getFrequencyDistribution<T>(items: T[]): Array<{ value: T; count: number; percentage: number }> {
  if (items.length === 0) return [];

  const frequency: Map<T, number> = new Map();

  for (const item of items) {
    frequency.set(item, (frequency.get(item) || 0) + 1);
  }

  const result = Array.from(frequency.entries())
    .map(([value, count]) => ({
      value,
      count,
      percentage: (count / items.length) * 100,
    }))
    .sort((a, b) => b.count - a.count);

  return result;
}

/**
 * Calculate Herfindahl-Hirschman Index for diversification
 * Higher values = more concentrated, Lower values = more diversified
 */
export function calculateHerfindahlIndex<T>(items: T[]): number {
  if (items.length === 0) return 0;

  const frequencies = getFrequencyDistribution(items);
  const sumOfSquares = frequencies.reduce((sum, freq) => {
    const proportion = freq.percentage / 100;
    return sum + Math.pow(proportion, 2);
  }, 0);

  return sumOfSquares;
}

/**
 * Calculate time difference in hours between two timestamps
 */
export function hoursBetween(timestamp1: number, timestamp2: number): number {
  return Math.abs(timestamp1 - timestamp2) / (1000 * 60 * 60);
}

/**
 * Calculate time difference in days between two timestamps
 */
export function daysBetween(timestamp1: number, timestamp2: number): number {
  return hoursBetween(timestamp1, timestamp2) / 24;
}

/**
 * Get time period between first and last items in array
 */
export function getTimePeriod(timestamps: number[]): { days: number; hours: number; start: Date; end: Date } {
  if (timestamps.length === 0) {
    const now = Date.now();
    return { days: 0, hours: 0, start: new Date(now), end: new Date(now) };
  }

  const sorted = [...timestamps].sort((a, b) => a - b);
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  const hours = hoursBetween(start, end);

  return {
    days: hours / 24,
    hours,
    start: new Date(start),
    end: new Date(end),
  };
}

/**
 * Format a number as a percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a number with appropriate units (K, M, B)
 */
export function formatNumber(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(2);
}

/**
 * Day names for converting day indices to names
 */
export const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

/**
 * Hour names for better readability
 */
export function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}