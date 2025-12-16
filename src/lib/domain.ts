import type { AppConfig } from "./config.js";

export function sanitizeDomainLabel(input: string): string {
    return String(input ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\-]/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-+/g, "-")
        .substring(0, 63);
}

export function isValidDomain(domain: string): boolean {
    const d = String(domain ?? "").toLowerCase().trim();
    if (!d) return false;

    const labels = d.split(".");
    return labels.every((label) => {
        if (label.length === 0 || label.length > 63) return false;
        return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
    });
}

export function ensureFqdn(domain: string, tld: string): string {
    const d = String(domain ?? "").trim();
    const cleanTld = String(tld ?? "").replace(/^\./, "").trim();

    if (!d) return d;
    if (d.includes(".")) return d;
    return `${d}.${cleanTld}`;
}

/**
 * Normalizes domain input to a fully qualified domain name (FQDN).
 * Validates the result and throws if invalid.
 */
export function normalizeDomain(domain: string, cfg: AppConfig): string {
    const input = String(domain ?? "").trim();
    const clean = ensureFqdn(input, cfg.tld);
    
    if (!isValidDomain(clean)) {
        throw new Error(
            `Invalid domain name: ${clean}. Please use only lowercase letters, numbers and hyphens (-). Max 63 characters per label.`
        );
    }
    
    return clean;
}