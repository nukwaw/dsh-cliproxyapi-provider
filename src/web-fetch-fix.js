// Local web_fetch fails behind transparent-proxy fake-ip DNS: every proxied
// hostname resolves into the synthetic 198.18.0.0/15 benchmark range, and the
// stock resolver of DSH's HttpFetchProvider rejects non-public answers before
// the proxy client can intercept the connection. This module wraps the
// registered provider's resolver: stock validation (literals, NAT64, every
// private/loopback/link-local block) runs first, and only its non-public
// rejection is reconsidered — allowed when the hostname is a real DNS name
// whose every answer is a fake-ip IPv4, because those connections are
// intercepted and reverse-mapped by the local proxy client. Any genuinely
// private answer keeps the original WEB_BLOCKED_URL.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// The id dsh-web-fetch-http registers under (its exported LOCAL_FETCH_PROVIDER_ID).
const FETCH_PROVIDER_ID = 'http'
const RETRY_DELAYS_MS = [100, 250, 500, 1000, 2000]

/** RFC 2544 benchmarking range 198.18.0.0/15 — the standard fake-ip pool. */
export function isFakeIpV4(address) {
  if (isIP(address) !== 4) return false
  const parts = address.split('.')
  return Number(parts[0]) === 198 && (Number(parts[1]) === 18 || Number(parts[1]) === 19)
}

/** WHATWG URL retains brackets around IPv6 hostnames; IP parsers do not. */
function stripIpv6Brackets(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

/**
 * Wrap the stock resolver with a fake-ip carve-out. The stock result always
 * wins; only a WEB_BLOCKED_URL rejection is re-examined, and only a hostname
 * (never an IP literal) whose complete answer set is fake-ip is released.
 */
export function createFakeIpTolerantResolver(originalResolve, lookupFn = lookup) {
  return async (hostname, signal) => {
    try {
      return await originalResolve(hostname, signal)
    } catch (error) {
      if (error?.code !== 'WEB_BLOCKED_URL') throw error
      const unbracketed = stripIpv6Brackets(hostname)
      // A literal states its address directly; fake-ip only exists through DNS.
      if (isIP(unbracketed) !== 0) throw error
      const resolved = await lookupFn(unbracketed, { all: true, order: 'verbatim' })
      const fakeIpOnly = resolved.length > 0
        && resolved.every((entry) => entry.family === 4 && isFakeIpV4(entry.address))
      if (!fakeIpOnly) throw error
      return resolved.map((entry) => ({ address: entry.address, family: entry.family }))
    }
  }
}

/**
 * Patch the registered HTTP fetch provider's resolver in place, preserving its
 * limits, redirect handling, and every other safety check. Registration order
 * against web-fetch-http is not guaranteed, so installation retries briefly;
 * the original resolver is restored when this plugin disposes.
 */
export function installWebFetchFix(ctx) {
  let disposed = false
  let attempts = 0
  let retryDispose

  const tryInstall = () => {
    if (disposed) return
    const registry = ctx.web?.fetchProviders
    const provider = registry instanceof Map ? registry.get(FETCH_PROVIDER_ID) : undefined
    if (provider === undefined) {
      if (attempts < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempts]
        attempts += 1
        retryDispose = ctx.timeout(tryInstall, delay)
      } else {
        ctx.logger.warn('llm-cliproxyapi: web fetch provider "http" not found; fake-ip DNS fix inactive')
      }
      return
    }
    if (typeof provider.resolveAddresses !== 'function') {
      ctx.logger.warn('llm-cliproxyapi: web fetch provider "http" has no replaceable resolver; fake-ip DNS fix inactive')
      return
    }
    const original = provider.resolveAddresses
    const tolerant = createFakeIpTolerantResolver(original)
    provider.resolveAddresses = tolerant
    ctx.logger.info('llm-cliproxyapi: web fetch tolerates fake-ip DNS answers (198.18.0.0/15)')
    ctx.effect(() => () => {
      if (provider.resolveAddresses === tolerant) provider.resolveAddresses = original
    }, 'llm-cliproxyapi: web fetch resolver restore')
  }

  ctx.effect(() => {
    tryInstall()
    return () => {
      disposed = true
      retryDispose?.()
    }
  }, 'llm-cliproxyapi: web fetch fake-ip fix')
}
