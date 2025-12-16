import { ensureFqdn, isValidDomain, normalizeDomain } from "./domain.js";
import { readConfig, writeConfig, type AppConfig, type LinkEntry } from "./config.js";
import {removeDnsmasqConfig, addDnsmasqConfig, reloadDnsmasq} from "./dnsmasq.js";
import { removeHost, addHost } from "./resolver.js";
import { removeCaddyFile, reloadCaddy } from "./caddy.js";
import addCaddyFile from "./caddy.js";
import { cleanupUnusedIsolatedPhp } from "./php.js";

/**
 * Removes all DNS, resolver, and Caddy configurations for a site.
 */
export async function teardownSite(host: string): Promise<void> {
    await removeDnsmasqConfig(host);
    await removeHost(host);
    await removeCaddyFile(host);
    await reloadCaddy();
    await reloadDnsmasq()
}

/**
 * Gets the PHP socket path for a specific version.
 * Returns the socket path in the format expected by PHP-FPM.
 */
function getPhpSocketForVersion(version: string): string {
    const homeDir = process.env.HOME || "/Users/" + process.env.USER;
    return `${homeDir}/.config/harbor/harbor-php-${version}.sock`;
}

/**
 * Sets up DNS, resolver, and Caddy configurations for a site.
 */
export async function setupSite(host: string, entry: LinkEntry, reload_dnsmasq: boolean = true): Promise<void> {
    await addDnsmasqConfig(host);
    await addHost(host);

    if (entry.type === "proxy") {
        await addCaddyFile(host, null, true, entry.target);
    } else {
        // Use site-specific PHP socket if phpVersion is set
        const phpSocket = entry.phpVersion ? getPhpSocketForVersion(entry.phpVersion) : undefined;
        await addCaddyFile(host, entry.root, false, undefined, phpSocket);
    }

    await reloadCaddy();
    if (reload_dnsmasq) {
        await reloadDnsmasq();
    }
}

export async function removeSite(domain: string, expected: "link" | "proxy"): Promise<string> {
    const cfg = readConfig();
    const fqdn = normalizeDomain(domain, cfg);
    const entry = cfg.links[fqdn];

    if (!entry || entry.type !== expected) {
        throw new Error(`No ${expected} found for: ${fqdn}`);
    }

    // Store PHP version before deleting entry
    const phpVersion = entry.type === "link" ? entry.phpVersion : undefined;

    delete cfg.links[fqdn];
    writeConfig(cfg);

    await teardownSite(fqdn);

    // Clean up isolated PHP config if it was using one
    if (phpVersion) {
        await cleanupUnusedIsolatedPhp(cfg, phpVersion);
    }

    return fqdn;
}
