import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { readConfig, writeConfig } from "../lib/config.js";
import { getInstalledPhpVersions, switchPhpVersion, type PhpCandidate } from "../lib/php.js";
import { handleCommandError } from "../lib/command-utils.js";

export function phpCommand() {
    const cmd = new Command("php");

    cmd
        .description("Switch PHP version")
        .action(async () => {
            try {
                const cfg = readConfig();
                const versions = await getInstalledPhpVersions();

                if (versions.length === 0) {
                    console.log("No PHP versions found. Install PHP via: brew install php@8.2");
                    return;
                }

                if (versions.length === 1) {
                    const only = versions[0] as PhpCandidate;
                    console.log(`Only one PHP version installed: ${only.version} (${only.formula})`);
                    return;
                }

                const currentFormula = cfg.php.formula;

                const answer = await select({
                    message: "Select PHP version:",
                    choices: versions.map((v) => ({
                        name: `PHP ${v.version} (${v.formula})${v.formula === currentFormula ? " ← current" : ""}`,
                        value: v,
                    })),
                    default: versions.find((v) => v.formula === currentFormula),
                });

                const selected = answer as PhpCandidate;

                if (selected.formula === currentFormula) {
                    console.log(`Already using PHP ${selected.version}.`);
                    return;
                }

                const updatedCfg = await switchPhpVersion(cfg, selected);
                writeConfig(updatedCfg);

                console.log(`Switched to PHP ${selected.version}.`);
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
