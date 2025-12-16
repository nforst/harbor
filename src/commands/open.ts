import { Command } from "commander";
import { readConfig } from "../lib/config.js";
import { sanitizeDomainLabel } from "../lib/domain.js";
import { handleCommandError } from "../lib/command-utils.js";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export function openCommand() {
    const cmd = new Command("open");

    cmd
        .description("Opens a site in the default browser")
        .argument("[domain]", "Domain to open (e.g. myapp or myapp.test). If omitted, uses current directory name.")
        .action(async (domain) => {
            try {
                const cfg = readConfig();

                // Determine domain to open
                let targetDomain: string;
                if (domain) {
                    // If domain doesn't contain a dot, append the default TLD
                    targetDomain = domain.includes(".") ? domain : `${domain}.${cfg.tld}`;
                } else {
                    // Use current directory name + default TLD
                    const cwd = process.cwd();
                    const dirName = sanitizeDomainLabel(path.basename(cwd));
                    targetDomain = `${dirName}.${cfg.tld}`;
                }

                // Check if the domain exists in links
                const entry = cfg.links[targetDomain];
                if (!entry) {
                    console.error(`\n  \x1b[31m✖\x1b[0m Domain \x1b[36m${targetDomain}\x1b[0m is not linked.\n`);
                    console.log("  Available sites:");
                    const sites = Object.keys(cfg.links);
                    if (sites.length === 0) {
                        console.log("    \x1b[90m(none)\x1b[0m\n");
                    } else {
                        sites.forEach(site => console.log(`    • ${site}`));
                        console.log("");
                    }
                    process.exit(1);
                }

                const url = `https://${targetDomain}`;
                console.log(`Opening ${url}...`);

                // Open in default browser (macOS)
                await execAsync(`open "${url}"`);
            } catch (e: any) {
                console.log(handleCommandError(e));
            }
        });

    return cmd;
}
