import { Command } from "commander";
import { getServiceStatus, getHarborServices, formatServiceStatus } from "../lib/services.js";

export function statusCommand() {
    const cmd = new Command("status");

    cmd
        .description("Shows the status of Harbor services (Caddy, dnsmasq, PHP)")
        .action(async () => {
            const services = getHarborServices();
            
            console.log("\nHarbor Services Status:\n");
            
            let allHealthy = true;
            
            for (const service of services) {
                const status = getServiceStatus(service);
                console.log(formatServiceStatus(status));
                
                if (!status.running || !status.loaded) {
                    allHealthy = false;
                }
            }
            
            console.log("");
            
            if (allHealthy) {
                console.log("\x1b[32m✔ All services are running.\x1b[0m");
            } else {
                console.log("\x1b[33m⚠ Some services are not running. Try: harbor start\x1b[0m");
            }
        });

    return cmd;
}
