import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { provisionLink } from "../lib/provision.js";
import { sanitizeDomainLabel } from "../lib/domain.js";
import { handleCommandError } from "../lib/command-utils.js";

export function linkCommand() {
    const cmd = new Command("link");

    cmd
        .description("Links a domain to the current directory (or public/ if present)")
        .argument("[domain]", "e.g. myapp (=> myapp.<tld>) or myapp.test")
        .action(async (domain) => {
            try {
                const cwd = process.cwd();
                const publicDir = path.join(cwd, "public");
                const root = fs.existsSync(path.join(publicDir, "index.php"))
                    ? publicDir
                    : cwd;

                const fallback = sanitizeDomainLabel(path.basename(cwd));
                const res = await provisionLink({ domain, tldFallback: fallback, root });

                console.log(`Linked: https://${res.domain} -> ${res.root}`);
            } catch (e: any) {
                console.log(handleCommandError(e));
            }
        });

    return cmd;
}