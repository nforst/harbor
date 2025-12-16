import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { readConfig, writeConfig } from "../lib/config.js";
import { getInstalledPhpVersions, setupIsolatedPhp, cleanupUnusedIsolatedPhp, type PhpCandidate } from "../lib/php.js";
import { sanitizeDomainLabel } from "../lib/domain.js";
import { handleCommandError } from "../lib/command-utils.js";
import { setupSite } from "../lib/sites.js";
import * as path from "path";

export function isolateCommand() {
    const cmd = new Command("isolate");

    cmd
        .description("Use a specific PHP version for a site")
        .argument("[domain]", "Domain to isolate (e.g. myapp or myapp.test). If omitted, uses current directory name.")
        .argument("[phpVersion]", "PHP version to use (e.g. 8.2, 8.3)")
        .action(async (domain, phpVersion) => {
            try {
                const cfg = readConfig();
                const versions = await getInstalledPhpVersions();

                if (versions.length === 0) {
                    console.log("\n  \x1b[31m✖\x1b[0m No PHP versions found. Install PHP via: \x1b[36mbrew install php@8.2\x1b[0m\n");
                    return;
                }

                // Determine target domain
                let targetDomain: string;
                if (domain) {
                    targetDomain = domain.includes(".") ? domain : `${domain}.${cfg.tld}`;
                } else {
                    // Find a link that matches the current directory path
                    const cwd = process.cwd();
                    const matchingEntry = Object.entries(cfg.links).find(([host, entry]) => {
                        if (entry.type === "link") {
                            return entry.root === cwd || entry.root === path.join(cwd, "public");
                        }
                        return false;
                    });

                    if (!matchingEntry) {
                        console.error(`\n  \x1b[31m✖\x1b[0m Current directory is not linked.\n`);
                        console.log("  Run \x1b[36mharbor link\x1b[0m first to create a site.\n");
                        process.exit(1);
                    }

                    targetDomain = matchingEntry[0];
                }

                // Check if domain exists and is a link (not a proxy)
                const entry = cfg.links[targetDomain];
                if (!entry) {
                    console.error(`\n  \x1b[31m✖\x1b[0m Domain \x1b[36m${targetDomain}\x1b[0m is not linked.\n`);
                    console.log("  Run \x1b[36mharbor link\x1b[0m first to create a site.\n");
                    process.exit(1);
                }

                if (entry.type !== "link") {
                    console.error(`\n  \x1b[31m✖\x1b[0m Domain \x1b[36m${targetDomain}\x1b[0m is a proxy, not a PHP site.\n`);
                    process.exit(1);
                }

                // Determine PHP version to use
                let selectedVersion: PhpCandidate;

                if (phpVersion) {
                    // User provided a version - find matching installed version
                    const normalizedInput = phpVersion.replace(/^php@?/, "");

                    if (normalizedInput === "global" || normalizedInput === "default") {
                        const globalVersion = cfg.php.version;
                        const match = versions.find(v => v.version === globalVersion);
                        if (!match) {
                            console.error(`\n  \x1b[31m✖\x1b[0m Global PHP version ${globalVersion} is not installed.\n`);
                            process.exit(1);
                        }
                        selectedVersion = match;
                    } else {
                        const match = versions.find(v =>
                            v.version.startsWith(normalizedInput) ||
                            `${v.major}.${v.minor}` === normalizedInput
                        );

                        if (!match) {
                            console.error(`\n  \x1b[31m✖\x1b[0m PHP ${normalizedInput} is not installed.\n`);
                            console.log("  Installed versions:");
                            versions.forEach(v => console.log(`    • PHP ${v.version} (${v.formula})`));
                            console.log("");
                            process.exit(1);
                        }

                        selectedVersion = match;
                    }
                } else {
                    // Interactive selection
                    const currentVersion = entry.phpVersion || cfg.php.version;

                    const selection = await select<PhpCandidate | "default">({
                        message: `Select PHP version for ${targetDomain}:`,
                        choices: [
                            {
                                name: "Use global default" + (currentVersion === undefined || currentVersion === cfg.php.version ? " ← current" : ""),
                                value: "default" as const
                            },
                            ...versions.map((v) => ({
                                name: `PHP ${v.version} (${v.formula})${v.version === currentVersion ? " ← current" : ""}`,
                                value: v,
                            }))
                        ],
                    });

                    if (selection === "default") {
                        // Remove site-specific PHP version
                        if (entry.phpVersion) {
                            const oldVersion = entry.phpVersion;
                            delete entry.phpVersion;
                            cfg.links[targetDomain] = entry;
                            writeConfig(cfg);

                            // Regenerate site config to use global PHP
                            await setupSite(targetDomain, entry, false);

                            // Clean up isolated PHP config if no longer in use
                            await cleanupUnusedIsolatedPhp(cfg, oldVersion);

                            console.log(`\n  \x1b[32m✔\x1b[0m ${targetDomain} now uses the global PHP version (${cfg.php.version}).\n`);
                        } else {
                            console.log(`\n  ${targetDomain} already uses the global PHP version (${cfg.php.version}).\n`);
                        }
                        return;
                    }

                    selectedVersion = selection;
                }

                // Check if already using this version
                if (entry.phpVersion === selectedVersion.version) {
                    console.log(`\n  ${targetDomain} is already using PHP ${selectedVersion.version}.\n`);
                    return;
                }

                // Remember the old version for cleanup
                const oldVersion = entry.phpVersion;

                // Update the site configuration first
                entry.phpVersion = selectedVersion.version;
                cfg.links[targetDomain] = entry;

                // Clean up previous isolated PHP version if switching from one isolated version to another
                if (oldVersion) {
                    await cleanupUnusedIsolatedPhp(cfg, oldVersion);
                }

                // Set up isolated PHP-FPM config for this version
                await setupIsolatedPhp(selectedVersion.version);

                // Write the config
                writeConfig(cfg);

                // Regenerate Caddy config with isolated socket
                await setupSite(targetDomain, entry, false);

                console.log(`\n  \x1b[32m✔\x1b[0m ${targetDomain} now uses PHP ${selectedVersion.version}.\n`);
            } catch (e: any) {
                // Handle Ctrl+C gracefully
                if (e?.name === "ExitPromptError") {
                    return;
                }
                console.log(handleCommandError(e));
            }
        });

    return cmd;
}
