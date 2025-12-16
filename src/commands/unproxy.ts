import { Command } from "commander";
import { removeSite } from "../lib/sites.js";
import { handleCommandError } from "../lib/command-utils.js";

export function unproxyCommand() {
    const cmd = new Command("unproxy");

    cmd
        .description("Removes a proxy (domain)")
        .argument("<domain>", "e.g. frontend or frontend.test")
        .action(async (domain) => {
            try {
                const fqdn = await removeSite(domain, "proxy");
                console.log(`Unproxied: ${fqdn}`);
            } catch (e: any) {
                console.log(handleCommandError(e));
            }
        });

    return cmd;
}
