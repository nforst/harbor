import { Command } from "commander";
import { isMac } from "../lib/paths.js";
import { readConfig, writeConfig } from "../lib/config.js";
import { run } from "../lib/shell.js";
import { setupPhpFpm } from "../lib/php.js";
import { implementDnsmasqImport, setupSudoersRule } from "../lib/dnsmasq.js";
import { setupCaddy, assertPortsAvailable } from "../lib/caddy.js";
import { APP_VERSION } from "../lib/version.js";

export function installCommand() {
    const cmd = new Command("install");

    cmd
        .description("Installs all dependencies. Use --tld <tld> to set the default TLD (e.g. --tld dev)")        
        .option("--tld <tld>", "TLD, e.g. test", "test")
        .action(async (opts) => {
            if (!isMac()) {
                throw new Error("This command is temporarily only available for macOS.");
            }
            
            // Check if required ports are available before doing anything
            await assertPortsAvailable();
            
            let cfg = readConfig();
            cfg.tld = String(opts.tld || "test").replace(/^\./, "");
            
            await run("brew", ["install", "caddy", "dnsmasq"], 'Installing caddy, dnsmasq... (this may take a while)');
            await setupSudoersRule();
            await setupCaddy();
            await implementDnsmasqImport()
            await run("brew", ["services", "restart", "dnsmasq"], 'Starting dnsmasq...', true);
            cfg = await setupPhpFpm(cfg);
            cfg.installVersion = APP_VERSION;
            writeConfig(cfg);
            console.log(`\nInstallation complete.`);
            console.log(`TLD: .${cfg.tld}`);
            console.log(`\nNext steps:`);
            console.log(`  harbor link`);
            console.log(`  harbor proxy frontend localhost:3000`);
        });

    return cmd;
}
