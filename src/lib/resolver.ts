import { readConfig } from "./config.js";
import { run } from "./shell.js";
import fs from "fs/promises";
import os from "os";
import path from "path";

/**
 * Extract TLD from a hostname (e.g., "frontend.test" -> "test")
 */
function extractTld(host: string): string {
    const parts = host.split(".");
    return parts[parts.length - 1] ?? host;
}

export async function addHost(host: string) {
    const cfg = readConfig();
    const dnsAddress = cfg.dnsmasq.address;
    const tld = extractTld(host);
    const resolverPath = `/etc/resolver/${tld}`;
    const resolverContent = `nameserver ${dnsAddress}\nport 53\n`;

    // Write to temp file first, then use sudo to move it
    const tmpPath = path.join(os.tmpdir(), `harbor-resolver-${host}`);
    await fs.writeFile(tmpPath, resolverContent, "utf8");

    await run(
        "bash",
        ["-lc", `sudo mkdir -p /etc/resolver && sudo install -m 644 '${tmpPath}' '${resolverPath}'`],
        undefined
    );

    await fs.unlink(tmpPath).catch(() => {});
}

export async function removeHost(host: string) {
    // Note: We don't remove the TLD resolver file because other sites might still use it
    // The resolver file is only created per TLD, not per host
}
