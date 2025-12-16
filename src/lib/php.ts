import { readConfig, type AppConfig } from "./config.js";
import { getInstalledFormulaVersion, getPrefix, getServicesList, listFormulas, startService, stopService } from "./brew.js";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { compareSemver, parseSemver } from "./version.js";
import { harborHomeDir, phpSocketPath } from "./paths.js";
import { removeFileIfExists } from "./file-utils.js";

export type PhpCandidate = { formula: string; version: string; major: number; minor: number; patch: number };

async function getPhpDir(version: string): Promise<string> {
    const prefix = await getPrefix();
    const base = path.join(prefix, "etc", "php");

    const parts = String(version).split(".");
    const finalVersion = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];

    return path.join(base, finalVersion as string);
}

export async function resolvePhpFpmConfigPath(cfg: AppConfig): Promise<string | null> {
    const version = cfg.php?.version;
    if (!version) return null;
    const phpDir = await getPhpDir(version);
    return path.join(phpDir, "php-fpm.d", "harbor-php-fpm.conf");
}

async function installSocket(phpVersion: string, isolate = false): Promise<void> {
    const phpDir = await getPhpDir(phpVersion);
    const phpFpmDir = path.join(phpDir, "php-fpm.d");
    await fs.mkdir(phpFpmDir, { recursive: true });

    const templateUrl = new URL("../assets/harbor-php-fpm.conf", import.meta.url);
    const template = await fs.readFile(templateUrl, "utf8");

    const harborUser = os.userInfo().username;
    const harborHomePath = harborHomeDir();

    // Use site-specific socket if phpVersion is provided
    const sockPath = phpSocketPath(isolate ? phpVersion : undefined);
    const poolName = isolate ? `harbor_${phpVersion}` : 'harbor';

    const content = template
        .replaceAll("HARBOR_USER", harborUser)
        .replace("HARBOR_SOCKET_PATH", sockPath)
        .replace("HARBOR_POOL_NAME", poolName);

    // Use unique config name for isolated versions
    const configName = isolate ? `harbor-php-fpm-${phpVersion}.conf` : "harbor-php-fpm.conf";
    const targetPath = path.join(phpFpmDir, configName);
    await fs.writeFile(targetPath, content, "utf8");

    await fs.mkdir(harborHomePath, { recursive: true });

    try {
        await fs.access(sockPath);
    } catch {
        await fs.writeFile(sockPath, "", { flag: "w" });
    }
}

async function setLatestPhpVersion(cfg: AppConfig): Promise<AppConfig> {
    const candidates = await getInstalledPhpVersions();

    if (!candidates.length) return cfg;

    candidates.sort((a, b) => compareSemver(a, b));
    const latest = candidates[candidates.length - 1] as PhpCandidate;

    const servicesMap = await getServicesList();

    if (!((cfg as any).php?.formula === latest.formula && (cfg as any).php?.version === latest.version)) {
        for (const c of candidates) {
            if (c.formula !== latest.formula) {
                await stopService(c.formula, servicesMap);
            }
        }
    }

    cfg.php.version = latest.version;
    cfg.php.formula = latest.formula;

    return cfg;
}

export async function setupPhpFpm(cfg: AppConfig): Promise<AppConfig> {
    if (!cfg.php.version) {
        cfg = await setLatestPhpVersion(cfg);
    }

    await installSocket(cfg.php.version as string);
    await startService(cfg.php.formula as string, true);

    return cfg;
}

/**
 * Returns all installed PHP versions from Homebrew.
 */
export async function getInstalledPhpVersions(): Promise<PhpCandidate[]> {
    const formulas = await listFormulas();

    const candidates = await Promise.all(
        formulas
            .filter((f) => f === "php" || f.startsWith("php@"))
            .map(async (formula) => {
                const version = (await getInstalledFormulaVersion(formula)) ?? "0.0.0";
                const sv = parseSemver(version);
                return { formula, version, major: sv.major, minor: sv.minor, patch: sv.patch } as PhpCandidate;
            })
    );

    return candidates.sort((a, b) => compareSemver(a, b));
}

/**
 * Switches to a different PHP version.
 * Stops the old PHP-FPM service, removes old config, installs new config, starts new service.
 */
export async function switchPhpVersion(cfg: AppConfig, newVersion: PhpCandidate): Promise<AppConfig> {
    const oldFormula = cfg.php.formula;
    const oldVersion = cfg.php.version;

    // Nothing to do if already on this version
    if (oldFormula === newVersion.formula && oldVersion === newVersion.version) {
        return cfg;
    }

    const servicesMap = await getServicesList();

    // Stop old PHP service if running
    if (oldFormula) {
        await stopService(oldFormula, servicesMap);

        // Remove old PHP-FPM config
        const oldConfigPath = await resolvePhpFpmConfigPath(cfg);
        if (oldConfigPath) {
            await removeFileIfExists(oldConfigPath);
        }
    }

    // Update config
    cfg.php.version = newVersion.version;
    cfg.php.formula = newVersion.formula;

    // Install new socket config
    await installSocket(newVersion.version);

    // Start new PHP service
    await startService(newVersion.formula, true);

    return cfg;
}

/**
 * Sets up an isolated PHP version for a specific site.
 * Creates a separate PHP-FPM config with a unique socket for the given version.
 */
export async function setupIsolatedPhp(phpVersion: string): Promise<void> {
    const candidates = await getInstalledPhpVersions();
    const match = candidates.find(c => c.version === phpVersion);

    if (!match) {
        throw new Error(`PHP ${phpVersion} is not installed`);
    }

    const cfg = readConfig();
    const phpDir = await getPhpDir(phpVersion);
    const phpFpmDir = path.join(phpDir, "php-fpm.d");
    const wwwConfPath = path.join(phpFpmDir, "www.conf");
    const backupPath = path.join(phpFpmDir, "www.conf.backup");

    // Only backup www.conf for non-global versions
    if (phpVersion !== cfg.php.version) {
        // Check if www.conf exists and back it up
        try {
            await fs.access(wwwConfPath);
            // If backup already exists, don't overwrite
            try {
                await fs.access(backupPath);
            } catch {
                await fs.copyFile(wwwConfPath, backupPath);
            }
            // Remove the original www.conf to avoid conflicts
            await fs.unlink(wwwConfPath);
        } catch {
            // www.conf does not exist, nothing to do
        }
    }

    // Install isolated socket config with version-specific socket
    await installSocket(phpVersion, true);

    // Start the PHP-FPM service for this version
    const configPath = path.join(phpDir, "php-fpm.d", `harbor-php-fpm-${phpVersion}.conf`);
    let restartIfRunning = false;
    if (phpVersion === cfg.php.version) {
        try {
            await fs.access(configPath);
            restartIfRunning = false;
        } catch {
            restartIfRunning = true;
        }
    }
    await startService(match.formula, restartIfRunning);
}

/**
 * Checks if any site is using a specific PHP version.
 * Returns true if the version is in use, false otherwise.
 */
function isPhpVersionInUse(cfg: AppConfig, phpVersion: string): boolean {
    return Object.values(cfg.links).some(entry => {
        if (entry.type === "link") {
            return entry.phpVersion === phpVersion;
        }
        return false;
    });
}

/**
 * Cleans up isolated PHP config and socket if no site is using that version anymore.
 * Should be called after removing a PHP version isolation from a site.
 */
export async function cleanupUnusedIsolatedPhp(cfg: AppConfig, phpVersion: string): Promise<void> {
    // Check if any site is still using this version
    if (isPhpVersionInUse(cfg, phpVersion)) {
        return;
    }

    const candidates = await getInstalledPhpVersions();
    const match = candidates.find(c => c.version === phpVersion);

    if (!match) {
        // Version not installed anymore, nothing to clean up
        return;
    }

    const phpDir = await getPhpDir(phpVersion);
    const phpFpmDir = path.join(phpDir, "php-fpm.d");
    const configName = `harbor-php-fpm-${phpVersion}.conf`;
    const configPath = path.join(phpFpmDir, configName);
    const wwwConfPath = path.join(phpFpmDir, "www.conf");
    const backupPath = path.join(phpFpmDir, "www.conf.backup");

    // Remove PHP-FPM config
    await removeFileIfExists(configPath);

    // Restore www.conf from backup if it exists (only for non-global versions)
    if (phpVersion !== cfg.php.version) {
        try {
            await fs.access(backupPath);
            await fs.copyFile(backupPath, wwwConfPath);
            await fs.unlink(backupPath);
        } catch {
            // No backup, nothing to restore
        }
    }

    // Remove socket file
    const sockPath = phpSocketPath(phpVersion);
    await removeFileIfExists(sockPath);

    // Stop the PHP-FPM service for this version (only if not global)
    if (phpVersion !== cfg.php.version) {
        const servicesMap = await getServicesList();
        await stopService(match.formula, servicesMap);
    }
}