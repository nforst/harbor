import { Command } from "commander";
import { provisionProxy } from "../lib/provision.js";
import { handleCommandError } from "../lib/command-utils.js";

export function proxyCommand() {
    const cmd = new Command("proxy");

    cmd
        .description("Proxies a domain to a host (e.g. localhost:3000)")
        .argument("<domain>", "e.g. frontend or frontend.test")
        .argument("<host>", "e.g. localhost:3000 or http://localhost:3000")
        .action(async (domain, target) => {
            try {
                const res = await provisionProxy({ domain, target: String(target) });
                console.log(`Proxy set up: https://${res.domain} => ${res.target}`);
            } catch (e: any) {
                console.log(handleCommandError(e));
            }
        });

    return cmd;
}