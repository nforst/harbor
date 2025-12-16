import type { AppConfig } from "./config.js";
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

async function installSocket(phpDir: string): Promise<void> {
    const phpFpmDir = path.join(phpDir, "php-fpm.d");
    await fs.mkdir(phpFpmDir, { recursive: true });

    const templateUrl = new URL("../assets/harbor-php-fpm.conf", import.meta.url);
    const template = await fs.readFile(templateUrl, "utf8");

    const harborUser = os.userInfo().username;
    const harborHomePath = harborHomeDir();

    const content = template
        .replaceAll("HARBOR_USER", harborUser)
        .replaceAll("HARBOR_HOME_PATH", harborHomePath);

    const targetPath = path.join(phpFpmDir, "harbor-php-fpm.conf");
    await fs.writeFile(targetPath, content, "utf8");

    const sockPath = phpSocketPath();
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

    await installSocket(await getPhpDir(cfg.php.version as string));
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
    await installSocket(await getPhpDir(newVersion.version));

    // Start new PHP service
    await startService(newVersion.formula, true);

    return cfg;
}