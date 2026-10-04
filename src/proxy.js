import 'dotenv/config';
import process from 'node:process';

/**
 * Get all available residential / YouTube proxies.
 * Reads dynamically from environment variables:
 * - YT_PROXY
 * - RESIDENTIAL_PROXY
 * - PROXY
 * Supports comma-separated lists for proxy rotation.
 */
export function getProxyPool() {
  const raw = process.env.YT_PROXY || process.env.RESIDENTIAL_PROXY || process.env.PROXY || '';
  return raw
    ? raw.split(',').map((p) => p.trim()).filter(Boolean)
    : [];
}

export const PROXY_POOL = getProxyPool();

let currentIndex = 0;

/**
 * Get the next proxy in the pool in round-robin order.
 * If no proxy is set, returns null (direct connection).
 */
export function getNextProxy() {
  const pool = getProxyPool();
  if (pool.length === 0) return null;
  const proxy = pool[currentIndex % pool.length];
  currentIndex = (currentIndex + 1) % pool.length;
  return proxy;
}

/**
 * Get a random proxy from the pool.
 * If the pool is empty, returns null.
 */
export function getRandomProxy() {
  const pool = getProxyPool();
  if (pool.length === 0) return null;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}
