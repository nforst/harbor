import { ensureFqdn, isValidDomain, normalizeDomain } from "./domain.js";
import { readConfig, writeConfig, type AppConfig, type LinkEntry } from "./config.js";
import { removeDnsmasqConfig, addDnsmasqConfig } from "./dnsmasq.js";
import { removeHost, addHost } from "./resolver.js";
import { removeCaddyFile } from "./caddy.js";
import addCaddyFile from "./caddy.js";

/**
 * Removes all DNS, resolver, and Caddy configurations for a site.
 */
export async function teardownSite(host: string): Promise<void> {
    await removeDnsmasqConfig(host);
    await removeHost(host);
    await removeCaddyFile(host);
}

/**
 * Sets up DNS, resolver, and Caddy configurations for a site.
 */
export async function setupSite(host: string, entry: LinkEntry): Promise<void> {
    await addDnsmasqConfig(host);
    await addHost(host);
    
    if (entry.type === "proxy") {
        await addCaddyFile(host, null, true, entry.target);
    } else {
        await addCaddyFile(host, entry.root);
    }
}

export async function removeSite(domain: string, expected: "link" | "proxy"): Promise<string> {
    const cfg = readConfig();
    const fqdn = normalizeDomain(domain, cfg);
    const entry = cfg.links[fqdn];

    if (!entry || entry.type !== expected) {
        throw new Error(`No ${expected} found for: ${fqdn}`);
    }

    delete cfg.links[fqdn];
    writeConfig(cfg);

    await teardownSite(fqdn);

    return fqdn;
}
