import { run, runCapture } from "./shell.js";
import { brewDir } from "./paths.js";

export type BrewServiceInfo = { status: string; user: string };

function toLines(s: string): string[] {
    return String(s).split("\n").map((l) => l.trim()).filter(Boolean);
}

export async function getPrefix(): Promise<string> {
    return brewDir();
}

export async function listFormulas(): Promise<string[]> {
    const raw = await runCapture("brew", ["list", "--formula"], false);
    return toLines(raw);
}

export async function getInstalledFormulaVersion(formula: string): Promise<string | null> {
    const line = await runCapture("brew", ["list", "--versions", formula], false);
    const parts = line.split(/\s+/);
    // Expected format: "<formula> <version> ..."
    return parts[1] ? String(parts[1]) : null;
}

export async function getServicesList(): Promise<Record<string, BrewServiceInfo>> {
    const servicesRaw = await runCapture("brew", ["services", "list"], true);

    const map: Record<string, BrewServiceInfo> = {};
    const lines = toLines(servicesRaw);
    const dataLines = lines.slice(1);

    for (const line of dataLines) {
        const parts = line.split(/\s+/);
        const name = parts[0];
        const status = parts[1] ?? "";
        const user = parts[2] ?? "";
        if (name) map[name] = { status, user };
    }
    return map;
}

export async function stopService(formula: string, servicesMap?: Record<string, BrewServiceInfo>) {
    const info = servicesMap?.[formula];

    const shouldStop = !info
        ? true
        : info.status === "started" || info.status === "error" || info.status === "unknown";

    if (!shouldStop) return;

    const sudo = info?.user === "root";

    try {
        await runCapture("brew", ["services", "stop", formula], sudo);
    } catch (err) {
        if (!sudo && isRootServiceError(err)) {
            await runCapture("brew", ["services", "stop", formula], true);
            return;
        }
        throw err;
    }
}

export async function startService(formula: string, sudo: boolean = false) {
    await run("brew", ["services", "restart", formula], `Restarting ${formula}`, sudo);
}

function isRootServiceError(err: any) {
    const msg = [err?.stderr, err?.shortMessage, err?.message, err?.all].filter(Boolean).join("\n");
    return /started as `root`|Try:\s*sudo brew services/i.test(msg);
}
