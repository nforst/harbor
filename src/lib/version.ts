import pkg from "../../package.json" with { type: "json" };
import type { AppConfig } from "./config.js";

export const APP_VERSION = String((pkg as any).version ?? "0.0.0");

const GITHUB_RELEASES_URL = "https://api.github.com/repos/nforst/harbor/releases/latest";

export function isInstalled(cfg: AppConfig): boolean {
    return !!(String(cfg.installVersion ?? "").trim());
}

export type Semver = { major: number; minor: number; patch: number };

export function parseSemver(v: string): Semver {
    const clean = String(v ?? "").replace(/^v/, "").trim();
    const [maj, min, pat] = clean.split(".").map((n) => Number(n ?? 0));
    return {
        major: Number.isFinite(maj) ? (maj || 0) : 0,
        minor: Number.isFinite(min) ? (min || 0) : 0,
        patch: Number.isFinite(pat) ? (pat || 0) : 0,
    };
}

export function compareSemver(a: Semver, b: Semver): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
}

/**
 * Check if the current app version is newer than the installed version.
 */
export function needsVersionUpdate(cfg: AppConfig): boolean {
    if (!isInstalled(cfg)) return false;
    
    const installed = parseSemver(cfg.installVersion ?? "0.0.0");
    const current = parseSemver(APP_VERSION);
    
    return compareSemver(current, installed) > 0;
}

/**
 * Fetch the latest version from GitHub releases.
 * Returns null if the check fails (network error, etc.)
 */
async function fetchLatestVersion(): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        
        const response = await fetch(GITHUB_RELEASES_URL, {
            signal: controller.signal,
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) return null;
        
        const data = await response.json() as { tag_name?: string };
        return data.tag_name ?? null;
    } catch {
        // Silently fail - don't bother user with network errors
        return null;
    }
}

/**
 * Check if a newer version is available on GitHub.
 * Returns the latest version if newer, null otherwise.
 */
export async function checkForUpdate(): Promise<string | null> {
    const latestTag = await fetchLatestVersion();
    if (!latestTag) return null;
    
    const current = parseSemver(APP_VERSION);
    const latest = parseSemver(latestTag);
    
    if (compareSemver(latest, current) > 0) {
        return latestTag.replace(/^v/, "");
    }
    
    return null;
}


