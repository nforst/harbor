import { Command } from "commander";
import { startService } from "../lib/brew.js";
import { isServiceRunning, getHarborServices } from "../lib/services.js";

export function startCommand() {
    const cmd = new Command("start");

    cmd
        .description("Starts all Harbor services (Caddy, dnsmasq, PHP). Use -r to force restart even if running.")
        .option("-r, --restart", "Restart services even if already running")
        .action(async (opts) => {
            const forceRestart = opts.restart === true;
            const services = getHarborServices();
            
            console.log("\nStarting Harbor services...\n");
            
            let startedCount = 0;
            let skippedCount = 0;
            
            for (const service of services) {
                const running = isServiceRunning(service);
                
                if (running && !forceRestart) {
                    console.log(`  \x1b[33m⊘\x1b[0m ${service} already running`);
                    skippedCount++;
                } else {
                    await startService(service, true);
                    const action = running ? "restarted" : "started";
                    console.log(`  \x1b[32m✔\x1b[0m ${service} ${action}`);
                    startedCount++;
                }
            }
            
            console.log("");
            if (startedCount > 0) {
                console.log(`\x1b[32m✔ ${startedCount} service(s) started.\x1b[0m`);
            } else {
                console.log("\x1b[32m✔ All services were already running.\x1b[0m");
            }
        });

    return cmd;
}
