import fs from "fs/promises";
import { Command } from "commander";
import { harborHomeDir, isMac } from "../lib/paths.js";
import { readConfig, writeConfig } from "../lib/config.js";
import { excludeCaddyImport, removeCaddyFile } from "../lib/caddy.js";
import { removeDnsmasqConfig } from "../lib/dnsmasq.js";
import { removeHost } from "../lib/resolver.js";
import { removeFileIfExists } from "../lib/file-utils.js";
import { resolvePhpFpmConfigPath } from "../lib/php.js";

export function uninstallCommand() {
    const cmd = new Command("uninstall");

    cmd
        .description("Uninstalls all configurations and files, but does not delete dnsmasq and caddy as they may be required for other services.")
        .action(async () => {
            if (!isMac()) {
                throw new Error("This command is temporarily only available for macOS.");
            }
            
            const cfg = readConfig();
            
            // Remove all linked sites
            for (const domain of Object.keys(cfg.links)) {
                await removeDnsmasqConfig(domain);
                await removeHost(domain);
                await removeCaddyFile(domain);
            }
            
            // Clear links
            cfg.links = {};
            delete cfg.installVersion;
            
            writeConfig(cfg);
            
            // Remove harbor-specific PHP-FPM config if present
            const phpFpmPath = await resolvePhpFpmConfigPath(cfg);
            if (phpFpmPath) {
                await removeFileIfExists(phpFpmPath);
            }

            // Remove Harbor from Caddy imports
            await excludeCaddyImport();

            // Remove Harbor home directory entirely
            await fs.rm(harborHomeDir(), { recursive: true, force: true });
            
            console.log("Harbor uninstalled successfully.");
            console.log("Note: dnsmasq and caddy were not removed as they may be required for other services.");
        });

    return cmd;
}
