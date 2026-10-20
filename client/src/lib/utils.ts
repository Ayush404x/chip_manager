import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Street } from '@chiproom/shared';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const integerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatChips(value: number): string {
  return integerFormatter.format(Math.round(value));
}

export function formatSignedChips(value: number): string {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : '−'}${formatChips(Math.abs(value))}`;
}

export function formatCompact(value: number): string {
  if (Math.abs(value) < 1000) return formatChips(value);
  if (Math.abs(value) < 1_000_000) {
    const compact = value / 1000;
    return `${Number.isInteger(compact) ? compact : compact.toFixed(1)}k`;
  }
  return `${(value / 1_000_000).toFixed(1)}m`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function streetLabel(street: Street | null | undefined): string {
  if (!street) return '—';
  return { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' }[street];
}

export function timeAgo(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
