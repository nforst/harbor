import { Command } from "commander";
import { readConfig } from "../lib/config.js";

export function sitesCommand() {
    const cmd = new Command("sites");

    cmd
        .description("Show all links/proxies")
        .action(() => {
            const cfg = readConfig();
            const entries = Object.values(cfg.links);

            if (!entries.length) {
                console.log("No sites configured.");
                return;
            }

            for (const e of entries) {
                if (e.type === "link") {
                    console.log(`https://${e.host} => ${e.root}`);
                } else {
                    console.log(`https://${e.host} => ${e.target}`);
                }
            }
        });

    return cmd;
}
