#!/usr/bin/env node
import { Command } from "commander";
import { installCommand } from "./commands/install.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { linkCommand } from "./commands/link.js";
import { unlinkCommand } from "./commands/unlink.js";
import { sitesCommand } from "./commands/sites.js";
import { proxyCommand } from "./commands/proxy.js";
import { unproxyCommand } from "./commands/unproxy.js";
import { tldCommand } from "./commands/tld.js";
import { phpCommand } from "./commands/php.js";
import { statusCommand } from "./commands/status.js";
import { startCommand } from "./commands/start.js";
import { openCommand } from "./commands/open.js";
import { isInstalled, APP_VERSION, needsVersionUpdate, checkForUpdate } from "./lib/version.js";
import { readConfig, writeConfig } from "./lib/config.js";

const program = new Command();

program
    .name("harbor")
    .description("A lightweight macOS local dev tool that runs web projects without VMs or containers. It auto-sets local domains and trusted HTTPS, and can proxy services to custom URLs.")
    .version(APP_VERSION);

program.addCommand(installCommand());
program.addCommand(uninstallCommand());
program.addCommand(linkCommand());
program.addCommand(unlinkCommand());
program.addCommand(sitesCommand());
program.addCommand(proxyCommand());
program.addCommand(unproxyCommand());
program.addCommand(tldCommand());
program.addCommand(phpCommand());
program.addCommand(statusCommand());
program.addCommand(startCommand());
program.addCommand(openCommand());

const INSTALL_FREE = new Set(["install", "help", "start", "status"]);

program.hook("preAction", (thisCommand, actionCommand) => {
    const cmdName = String(actionCommand?.name?.() ?? "");
    if (INSTALL_FREE.has(cmdName)) return;
    const cfg = readConfig();
    if(!isInstalled(cfg)) {
        actionCommand.error('Harbor is not installed. Please run `harbor install` first.')
    }
    
    // Auto-update version in config after brew upgrade
    if (needsVersionUpdate(cfg)) {
        cfg.installVersion = APP_VERSION;
        writeConfig(cfg);
    }
});

// Check for updates after command execution (non-blocking)
program.hook("postAction", async () => {
    const newVersion = await checkForUpdate();
    if (newVersion) {
        console.log(`\n\x1b[33m⬆ A new version of Harbor is available: ${newVersion} (current: ${APP_VERSION})\x1b[0m`);
        console.log(`  Run \x1b[36mbrew upgrade nforst/tools/harbor\x1b[0m to update.\n`);
    }
});

program.parse(process.argv);
