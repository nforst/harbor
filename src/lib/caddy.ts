import fs from "fs/promises";
import path from "path";
import { getServicesList, startService, listFormulas } from "./brew.js";
import { brewDir, caddyDir, phpSocketPath } from "./paths.js";
import { removeFileIfExists, writeFileIfChanged, readFileContent } from "./file-utils.js";
import { run, runCapture } from "./shell.js";

const PF_ANCHOR_PATH = "/etc/pf.anchors/harbor";
const PF_CONF_PATH = "/etc/pf.conf";
const PF_ANCHOR_CONTENT = `rdr pass inet proto tcp from any to any port 80 -> 127.0.0.1 port 51880
rdr pass inet proto tcp from any to any port 443 -> 127.0.0.1 port 51443
`;
const PF_CONF_LINES = [
    'rdr-anchor "harbor"',
    'load anchor "harbor" from "/etc/pf.anchors/harbor"'
];
const CADDY_PORT_CONFIG = `{
  http_port 51880
  https_port 51443
}

`;

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

/**
 * Check if Caddy is running with root or has run with root before
 */
export async function isCaddyRunningWithRoot(): Promise<boolean> {
    const services = await getServicesList();
    const caddyInfo = services['caddy'];
    
    if (!caddyInfo) return false;
    
    // Check if running with root or has run with root (status could be started, error, unknown)
    return caddyInfo.user === 'root';
}

/**
 * Fix Caddy data directory ownership after running as root
 */
async function fixCaddyDataOwnership(): Promise<void> {
    const caddyDataDir = path.join(await brewDir(), 'var', 'lib', 'caddy');
    const currentUser = process.env.USER || process.env.LOGNAME;
    
    if (!currentUser) {
        return;
    }
    
    // Check if directory exists before trying to chown
    try {
        await fs.access(caddyDataDir);
        await run('chown', ['-R', `${currentUser}:staff`, caddyDataDir], 'Fixing Caddy data directory ownership...', true);
    } catch {
        // Directory doesn't exist yet, nothing to fix
    }
}

/**
 * Restart Caddy without root (we use PF for port forwarding)
 */
export async function restartCaddy(): Promise<void> {
    // First check if running as root and stop it
    const runningAsRoot = await isCaddyRunningWithRoot();
    if (runningAsRoot) {
        // Stop root service first
        await run('brew', ['services', 'stop', 'caddy'], 'Stopping root Caddy service...', true);
        // Fix ownership of Caddy data directory so non-root user can access it
        await fixCaddyDataOwnership();
    }
    // Always start without sudo - we use PF for port forwarding
    await startService('caddy', false);
}

/**
 * Add port configuration to Caddyfile
 */
async function addPortConfigToCaddyfile(): Promise<void> {
    const caddyFile = path.join(await brewDir(), 'etc', 'Caddyfile');
    const currentContent = await readFileContent(caddyFile);
    
    // Check if port config already exists
    if (currentContent.includes('http_port 51880') && currentContent.includes('https_port 51443')) {
        return;
    }
    
    // Add port config at the top
    const newContent = CADDY_PORT_CONFIG + currentContent;
    await fs.writeFile(caddyFile, newContent, 'utf8');
}

/**
 * Create PF anchor file
 */
async function createPfAnchor(): Promise<void> {
    // Create the anchor file with sudo
    await run('tee', [PF_ANCHOR_PATH], undefined, true, {
        input: PF_ANCHOR_CONTENT,
        stdin: 'pipe'
    });
}

/**
 * Add PF configuration to pf.conf
 * 
 * PF rules must be in order: options, normalization, queueing, translation, filtering.
 * We need to insert rdr-anchor before any 'anchor' lines (filtering rules).
 */
async function addPfConfig(): Promise<void> {
    // Read current pf.conf
    const currentContent = await runCapture('cat', [PF_CONF_PATH], true);
    
    // Check if already configured
    if (currentContent.includes('rdr-anchor "harbor"')) {
        return;
    }
    
    const lines = currentContent.split('\n');
    const resultLines: string[] = [];
    let harborLinesInserted = false;
    
    for (const line of lines) {
        // Insert harbor rdr-anchor BEFORE the first 'anchor' line (filtering rule)
        // but after rdr-anchor lines (translation rules)
        // Match lines that start with 'anchor ' (filtering) but not 'rdr-anchor', 'nat-anchor', etc.
        if (!harborLinesInserted && /^anchor\s/.test(line)) {
            // Insert harbor lines before this anchor line
            resultLines.push(...PF_CONF_LINES);
            harborLinesInserted = true;
        }
        resultLines.push(line);
    }
    
    // If no anchor line was found, append at the end (fallback)
    if (!harborLinesInserted) {
        resultLines.push(...PF_CONF_LINES);
    }
    
    // Join lines and ensure file ends with a newline
    let newContent = resultLines.join('\n');
    if (!newContent.endsWith('\n')) {
        newContent += '\n';
    }
    
    // Write with sudo using tee
    await run('tee', [PF_CONF_PATH], undefined, true, {
        input: newContent,
        stdin: 'pipe'
    });
}

/**
 * Reload PF configuration
 */
async function reloadPf(): Promise<void> {
    await run('pfctl', ['-f', PF_CONF_PATH], 'Loading PF configuration...', true);
}

/**
 * Enable PF if not already enabled
 */
async function enablePfIfNeeded(): Promise<void> {
    const result = await runCapture('sh', ['-c', 'pfctl -s info 2>/dev/null | grep -q "Status: Enabled" && echo true || echo false'], true);
    
    if (result.trim() !== 'true') {
        await run('pfctl', ['-e'], 'Enabling PF...', true);
    }
}

interface SetupCaddyOptions {
    /** If true and Caddy was already running as root, keep it running as root */
    preserveRootIfExisting?: boolean;
}

/**
 * Setup Caddy with proper configuration.
 * Always sets up PF port forwarding so Caddy can run without root.
 */
export async function setupCaddy(options: SetupCaddyOptions = {}): Promise<void> {
    const { preserveRootIfExisting = false } = options;
    
    // Always set up the Caddyfile import
    await implementCaddyImport();
    
    // Add port configuration to Caddyfile (high ports that don't need root)
    await addPortConfigToCaddyfile();
    
    // Create PF anchor file for port forwarding 80->51880, 443->51443
    await createPfAnchor();
    
    // Add PF configuration to pf.conf
    await addPfConfig();
    
    // Reload PF to apply changes
    await reloadPf();
    
    // Enable PF if not already enabled
    await enablePfIfNeeded();
    
    // Restart Caddy - but respect user's existing setup if they had it running as root
    if (preserveRootIfExisting) {
        // User had Caddy running as root before, keep it that way
        await startService('caddy', true);
    } else {
        // Fresh install or was not running as root - start without root
        await restartCaddy();
    }
}

/**
 * Remove PF configuration (for uninstall)
 */
export async function removePfConfig(): Promise<void> {
    // Check if anchor file exists
    try {
        await runCapture('test', ['-f', PF_ANCHOR_PATH], true);
    } catch {
        // File doesn't exist, nothing to do
        return;
    }
    
    // Remove anchor lines from pf.conf
    const currentContent = await runCapture('cat', [PF_CONF_PATH], true);
    
    let newContent = currentContent;
    for (const line of PF_CONF_LINES) {
        const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lineRegex = new RegExp(`(^|\\r?\\n)${escaped}(?=\\r?\\n|$)`, 'g');
        newContent = newContent.replace(lineRegex, (match, prefix) => prefix || '');
    }
    
    // Clean up extra newlines
    newContent = newContent
        .replace(/\r?\n{3,}/g, '\n\n')
        .replace(/^\s*\r?\n/, '')
        .trimEnd() + '\n';
    
    // Write updated pf.conf
    await run('tee', [PF_CONF_PATH], undefined, true, {
        input: newContent,
        stdin: 'pipe'
    });
    
    // Remove anchor file
    await run('rm', ['-f', PF_ANCHOR_PATH], undefined, true);
    
    // Reload PF configuration
    await reloadPf();
}
