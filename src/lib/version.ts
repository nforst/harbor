import pkg from "../../package.json" with { type: "json" };
import type { AppConfig } from "./config.js";

export const APP_VERSION = String((pkg as any).version ?? "0.0.0");

export function isInstalled(cfg: AppConfig): boolean {
    return !!(String(cfg.installVersion ?? "").trim());
}

export type Semver = { major: number; minor: number; patch: number };

export function parseSemver(v: string): Semver {
    const clean = String(v ?? "").trim();
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


