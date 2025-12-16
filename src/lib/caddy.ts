import fs from "fs/promises";
import path from "path";
import { startService, stopService, listFormulas } from "./brew.js";
import { brewDir, caddyDir, phpSocketPath } from "./paths.js";
import { removeFileIfExists, writeFileIfChanged, readFileContent } from "./file-utils.js";
import { run, runCapture } from "./shell.js";

export default async function addCaddyFile(host: string, folder: string|null, proxy = false, proxyHost?: string) {
    let content;
    if (proxy) {
        // proxyHost is just host:port (e.g., "localhost:3000")
        content = `${host} {
            reverse_proxy ${proxyHost}
            tls internal
          }`;
    } else {
        content = `${host} {
            root * ${folder}
            php_fastcgi unix//${phpSocketPath()}
            file_server
            tls internal
          }`;
    }

    await fs.mkdir(caddyDir(), { recursive: true });

    const caddyFilePath = path.join(caddyDir(), `${host}.conf`);
    await writeFileIfChanged(caddyFilePath, content);
}

export async function removeCaddyFile(host: string) {
    const caddyFilePath = path.join(caddyDir(), `${host}.conf`);
    await removeFileIfExists(caddyFilePath);
}

export async function implementCaddyImport() {
    const caddyFile = path.join(await brewDir(), 'etc', 'Caddyfile');
    const harborCaddyDir = caddyDir();

    await fs.mkdir(harborCaddyDir, { recursive: true });

    const currentContent = await readFileContent(caddyFile);
    const importLine = `import ${harborCaddyDir}/*.conf`;

    if (!currentContent.includes(importLine)) {
        const newContent = importLine + '\n' + (currentContent.trim() ? '\n' + currentContent : '');
        await fs.writeFile(caddyFile, newContent, 'utf8');
    }
    // Note: Don't restart Caddy here - let the caller handle it
}

export async function excludeCaddyImport() {
    const caddyFile = path.join(await brewDir(), 'etc', 'Caddyfile');
    const harborCaddyDir = caddyDir();
    const importLine = `import ${harborCaddyDir}/*.conf`;

    const currentContent = await readFileContent(caddyFile);

    if (!currentContent.includes(importLine)) return;

    const escaped = importLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lineRegex = new RegExp(`(^|\\r?\\n)${escaped}(?=\\r?\\n|$)`, 'g');

    let newContent = currentContent.replace(lineRegex, (match, prefix) => prefix || '');
    newContent = newContent
        .replace(/\r?\n{3,}/g, '\n\n')
        .replace(/^\s*\r?\n/, '')
        .trimEnd() + '\n';

    await fs.writeFile(caddyFile, newContent, 'utf8');
    await restartCaddy();
}

/**
 * Check if Caddy is installed via brew
 */
export async function isCaddyInstalled(): Promise<boolean> {
    const formulas = await listFormulas();
    return formulas.includes('caddy');
}

export interface PortCheckResult {
    port: number;
    inUse: boolean;
    process?: string;
}

/**
 * Check if ports 80 and 443 are available.
 * Returns info about which ports are in use and by what process.
 */
export async function checkRequiredPorts(): Promise<PortCheckResult[]> {
    const ports = [80, 443];
    const results: PortCheckResult[] = [];
    
    for (const port of ports) {
        try {
            // Use lsof to check if port is in use (listening)
            const output = await runCapture('lsof', ['-i', `:${port}`, '-sTCP:LISTEN', '-t'], true);
            const pids = output.trim().split('\n').filter(Boolean);
            
            if (pids.length > 0 && pids[0]) {
                // Get process name for the first PID
                const processName = await runCapture('ps', ['-p', pids[0], '-o', 'comm='], false);
                results.push({
                    port,
                    inUse: true,
                    process: processName.trim().split('/').pop() || 'unknown'
                });
            } else {
                results.push({ port, inUse: false });
            }
        } catch {
            // lsof returns non-zero if no process found - port is free
            results.push({ port, inUse: false });
        }
    }
    
    return results;
}

/**
 * Throws an error if required ports are in use by non-Caddy processes.
 * Should be called before installing Harbor.
 */
export async function assertPortsAvailable(): Promise<void> {
    const caddyInstalled = await isCaddyInstalled();
    
    // If Caddy is already installed, it's fine if it's using the ports
    if (caddyInstalled) {
        return;
    }
    
    const portResults = await checkRequiredPorts();
    const blockedPorts = portResults.filter(p => p.inUse);
    
    if (blockedPorts.length > 0) {
        const details = blockedPorts
            .map(p => `  - Port ${p.port} is used by: ${p.process}`)
            .join('\n');
        
        throw new Error(
            `Cannot install Harbor: required ports are already in use.\n${details}\n\n` +
            `Please stop the conflicting services before running 'harbor install'.`
        );
    }
}

/**
 * Reload Caddy configuration without full restart.
 * This is faster than restart and picks up new site configs.
 */
export async function reloadCaddy(): Promise<void> {
    const caddyBin = path.join(await brewDir(), 'bin', 'caddy');
    const caddyFile = path.join(await brewDir(), 'etc', 'Caddyfile');
    await run(caddyBin, ['reload', '--config', caddyFile], 'Reloading Caddy...');
}

/**
 * Restart Caddy with root privileges
 */
export async function restartCaddy(): Promise<void> {
    await startService('caddy', true);
}

/**
 * Setup Caddy with proper configuration.
 * Caddy runs with root privileges to bind to ports 80 and 443.
 */
export async function setupCaddy(): Promise<void> {
    // Set up the Caddyfile import
    await implementCaddyImport();
    
    // Start Caddy with root privileges
    await restartCaddy();
}
