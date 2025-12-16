import { execSync } from "node:child_process";
import { readConfig } from "./config.js";
import type { AppConfig } from "./config.js";

export interface ServiceStatus {
    name: string;
    running: boolean;
    loaded: boolean;
    pid?: string;
}

/**
 * Get the status of a Homebrew service using launchctl (no sudo required)
 */
export function getServiceStatus(formula: string): ServiceStatus {
    const serviceName = `homebrew.mxcl.${formula}`;
    
    try {
        const output = execSync(`launchctl print system/${serviceName}`, { 
            encoding: "utf8", 
            stdio: ["pipe", "pipe", "pipe"] 
        });
        
        const running = /state\s*=\s*running/.test(output);
        const pidMatch = output.match(/pid\s*=\s*(\d+)/);
        
        const result: ServiceStatus = {
            name: formula,
            running,
            loaded: true, // If launchctl print succeeds, it's loaded
        };
        
        if (pidMatch?.[1]) {
            result.pid = pidMatch[1];
        }
        
        return result;
    } catch {
        return {
            name: formula,
            running: false,
            loaded: false,
        };
    }
}

/**
 * Check if a service is currently running
 */
export function isServiceRunning(formula: string): boolean {
    return getServiceStatus(formula).running;
}

/**
 * Get list of Harbor service formulas (caddy, dnsmasq, php)
 */
export function getHarborServices(cfg?: AppConfig): string[] {
    const config = cfg ?? readConfig();
    const services = ["caddy", "dnsmasq"];
    
    if (config.php.formula) {
        services.push(config.php.formula);
    }
    
    return services;
}

/**
 * Format a service status for display
 */
export function formatServiceStatus(status: ServiceStatus): string {
    const runningIcon = status.running ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✘\x1b[0m";
    const loadedIcon = status.loaded ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✘\x1b[0m";
    
    let line = `${status.name.padEnd(15)} Running: ${runningIcon}  Loaded: ${loadedIcon}`;
    
    if (status.pid) {
        line += `  PID: ${status.pid}`;
    }
    
    return line;
}
