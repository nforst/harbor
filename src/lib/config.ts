import fs from "fs";
import * as path from "path";
import { configDir, configPath } from "./paths.js";

export type LinkEntry =
    | { type: "link"; host: string; root: string }
    | { type: "proxy"; host: string; target: string };

export type AppConfig = {
    tld: string;
    links: Record<string, LinkEntry>;
    php: {
        version?: string;
        formula?: string;
    };
    dnsmasq: {
        address: string;
    };
    parks: string[];
    installVersion?: string;
};

function ensureConfigDir() {
    const dir = configDir();
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function defaultConfig(): AppConfig {
    return {
        tld: "test",
        links: {},
        php: {},
        dnsmasq: { address: "127.0.0.1" },
        parks: [],
    };
}

export function readConfig(): AppConfig {
    ensureConfigDir();
    const p = configPath();

    if (!fs.existsSync(p)) {
        const cfg = defaultConfig();
        writeConfig(cfg);
        return cfg;
    }

    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);

    return {
        ...defaultConfig(),
        ...parsed,
        links: {...(parsed?.links ?? {})},
        php: {...(parsed?.php ?? {})},
        dnsmasq: {
            ...defaultConfig().dnsmasq,
            ...(parsed?.dnsmasq ?? {}),
        },
        parks: Array.isArray(parsed?.parks) ? parsed.parks.map(String) : [],
        tld: String(parsed?.tld ?? "test").replace(/^\./, "") || "test",
        installVersion: parsed?.installVersion ? String(parsed.installVersion) : undefined,
    };
}

export function writeConfig(cfg: AppConfig) {
    ensureConfigDir();
    const p = configPath();
    const dir = path.dirname(p);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2), "utf8");
}

export async function updateConfig(mutator: (cfg: AppConfig) => AppConfig | Promise<AppConfig>): Promise<AppConfig> {
    const cfg = readConfig();
    const next = await mutator(cfg);
    writeConfig(next);
    return next;
}