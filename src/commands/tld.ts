import { Command } from "commander";
import { readConfig, writeConfig } from "../lib/config.js";
import { teardownSite, setupSite } from "../lib/sites.js";
import readline from "readline/promises";
import ora from "ora";

export function tldCommand() {
    const cmd = new Command("tld");

    cmd
        .description("Set the default TLD if none is specified")
        .argument("<tld>", "e.g. test, dev or local")
        .action(async (tld) => {

            const cfg = readConfig();
            const oldTld = cfg.tld;
            const tldRegex = /^[a-zA-Z]{2,63}$/;

            if (!tldRegex.test(tld)) {
                throw new Error(
                    `Invalid TLD: ${tld}. Must be a valid domain name (e.g. test, dev or local)`
                );
            }

            cfg.tld = tld;

            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const answer = await rl.question(
                `\nWould you like to migrate all sites with .${oldTld} → .${tld} [y/N]: `
            );

            rl.close();

            if (answer.toLowerCase().startsWith('y')) {
                const entries = Object.values(cfg.links).filter((site) => site.host.endsWith(`.${oldTld}`));
                for (const site of entries) {
                    const spinner = ora(`Migrating ${site.host}...`).start();
                    try {
                        await teardownSite(site.host);
                        delete cfg.links[site.host];

                        const newHost = site.host.replace(`.${oldTld}`, `.${tld}`);
                        const newEntry = { ...site, host: newHost };
                        
                        await setupSite(newHost, newEntry);
                        cfg.links[newHost] = newEntry;

                        spinner.succeed(`Migrated ${site.host} to ${newHost}`);
                    } catch (e) {
                        spinner.fail(`Failed to migrate ${site.host}`);
                    }
                }
            }

            writeConfig(cfg);
            console.log(`\nTLD set to "${tld}".`);

        });

    return cmd;
}
