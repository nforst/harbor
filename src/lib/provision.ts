import { updateConfig, type LinkEntry } from "./config.js";
import { ensureFqdn, isValidDomain, sanitizeDomainLabel } from "./domain.js";
import { setupSite } from "./sites.js";

/**
 * Validates a domain and throws a descriptive error if invalid.
 */
function assertValidDomain(domain: string, tld: string): void {
    if (!isValidDomain(domain)) {
        throw new Error(
            `Invalid domain name: ${domain}. Please use only lowercase letters, numbers and hyphens (-). Max 63 characters per label. Example: myapp.${tld}`
        );
    }
}

export async function provisionLink(params: { domain?: string; tldFallback?: string; root: string }): Promise<{ domain: string; root: string }> {
    const { root } = params;

    const { domain } = await updateConfig((cfg) => {
        let d = params.domain;
        if (!d) d = sanitizeDomainLabel(params.tldFallback ?? "");
        d = ensureFqdn(d, cfg.tld);

        assertValidDomain(d, cfg.tld);

        cfg.links[d] = { type: "link", root, host: d };
        return cfg;
    }).then((cfg) => ({
        domain: ensureFqdn(params.domain ?? sanitizeDomainLabel(params.tldFallback ?? ""), cfg.tld),
    }));

    const entry: LinkEntry = { type: "link", root, host: domain };
    await setupSite(domain, entry);

    return { domain, root };
}

/**
 * Normalizes a proxy target for Caddy reverse_proxy.
 * Caddy expects just host:port without scheme for simple proxying.
 * Accepts: "localhost:3000", "http://localhost:3000", "https://example.com"
 */
function normalizeProxyTarget(input: string): string {
    const trimmed = input.trim();
    
    // Already has protocol - extract just host:port
    if (/^https?:\/\//i.test(trimmed)) {
        const url = new URL(trimmed);
        return url.host; // Just host:port without scheme
    }
    
    // Just host:port - use as-is
    if (/^[a-z0-9.-]+(:\d+)?$/i.test(trimmed)) {
        return trimmed;
    }
    
    throw new Error(
        `Invalid proxy target: ${input}. Use "localhost:3000" or "http://localhost:3000"`
    );
}

export async function provisionProxy(params: { domain: string; target: string }): Promise<{ domain: string; target: string }> {
    const target = normalizeProxyTarget(params.target);

    const { domain } = await updateConfig((cfg) => {
        const d = ensureFqdn(params.domain, cfg.tld);

        assertValidDomain(d, cfg.tld);

        cfg.links[d] = { type: "proxy", target, host: d };
        return cfg;
    }).then((cfg) => ({ domain: ensureFqdn(params.domain, cfg.tld) }));

    const entry: LinkEntry = { type: "proxy", target, host: domain };
    await setupSite(domain, entry);

    return { domain, target };
}