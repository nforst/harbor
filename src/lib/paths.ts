import os from "os";
import * as path from "path";
import { runCapture } from "./shell.js";

export const APP_NAME = "harbor";

export function configDir(): string {
    return path.join(os.homedir(), ".config", APP_NAME);
}

export function configPath(): string {
    return path.join(configDir(), "config.json");
}

export function harborHomeDir(): string {
    return configDir();
}

export function caddyDir(): string {
    return path.join(harborHomeDir(), "caddy");
}

export function dnsmasqDir(): string {
    return path.join(harborHomeDir(), "dnsmasq");
}

export function phpSocketPath(version?: string): string {
    if (version) {
        return path.join(harborHomeDir(), `harbor-php-${version}.sock`);
    }
    return path.join(harborHomeDir(), "harbor.sock");
}

export function isMac(): boolean {
    return process.platform === "darwin";
}

let _brewPrefixCache: string | null = null;

export async function brewDir(): Promise<string> {
    if (_brewPrefixCache) return _brewPrefixCache;
    _brewPrefixCache = await runCapture("brew", ["--prefix"]);
    return _brewPrefixCache;
}
