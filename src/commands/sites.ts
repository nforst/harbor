import { Command } from "commander";
import { readConfig } from "../lib/config.js";

// OSC 8 hyperlink: makes text clickable in modern terminals
function hyperlink(url: string, text: string): string {
    return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

export function sitesCommand() {
    const cmd = new Command("sites");

    cmd
        .description("Show all links/proxies")
        .action(() => {
            const cfg = readConfig();
            const entries = Object.values(cfg.links);

            if (!entries.length) {
                console.log("\n  No sites configured.\n");
                console.log("  Get started:");
                console.log("    \x1b[36mharbor link\x1b[0m              Link current directory");
                console.log("    \x1b[36mharbor proxy app :3000\x1b[0m   Proxy to localhost:3000\n");
                return;
            }

            // Separate links and proxies
            const links = entries.filter(e => e.type === "link");
            const proxies = entries.filter(e => e.type === "proxy");

            console.log("");

            if (links.length > 0) {
                console.log("  \x1b[1m\x1b[4mLinked Sites\x1b[0m\n");
                for (const e of links) {
                    if (e.type === "link") {
                        const url = `https://${e.host}`;
                        console.log(`    \x1b[32m●\x1b[0m ${hyperlink(url, `\x1b[36m${url}\x1b[0m`)}`);
                        console.log(`      → ${e.root}\n`);
                    }
                }
            }

            if (proxies.length > 0) {
                console.log("  \x1b[1m\x1b[4mProxied Sites\x1b[0m\n");
                for (const e of proxies) {
                    if (e.type === "proxy") {
                        const url = `https://${e.host}`;
                        console.log(`    \x1b[34m●\x1b[0m ${hyperlink(url, `\x1b[36m${url}\x1b[0m`)}`);
                        console.log(`      → ${e.target}\n`);
                    }
                }
            }

            console.log(`  \x1b[90mTotal: ${links.length} link(s), ${proxies.length} proxy/proxies\x1b[0m\n`);
        });

    return cmd;
}
