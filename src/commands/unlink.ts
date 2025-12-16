import { Command } from "commander";
import { removeSite } from "../lib/sites.js";
import { handleCommandError } from "../lib/command-utils.js";

export function unlinkCommand() {
    const cmd = new Command("unlink");

    cmd
        .description("Removes a link (domain)")
        .argument("<domain>", "e.g. myapp or myapp.test")
        .action(async (domain) => {
            try {
                const fqdn = await removeSite(domain, "link");
                console.log(`Unlinked: ${fqdn}`);
            } catch (e: any) {
                console.log(handleCommandError(e));
            }
        });

    return cmd;
}
