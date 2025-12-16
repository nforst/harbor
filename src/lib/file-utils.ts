import fs from "fs/promises";
import path from "path";
import os from "os";
import { run } from "./shell.js";

/**
 * Writes content to a file with sudo privileges if needed.
 * Creates temp file, writes to it, and uses sudo to move it to destination.
 */
export async function writeFileSudoIfNeeded(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    const tmpPath = path.join(
        os.tmpdir(),
        `harbor-${crypto.randomUUID()}-${path.basename(filePath)}`
    );

    try {
        await fs.writeFile(tmpPath, content, "utf8");

        await run(
            "bash",
            ["-lc", `mkdir -p '${dir}' && install -m 644 '${tmpPath}' '${filePath}'`],
            `Updating ${path.basename(filePath)}...`,
            true
        );
    } finally {
        await fs.unlink(tmpPath).catch(() => {});
    }
}

/**
 * Reads file content, handling missing files gracefully.
 */
export async function readFileContent(filePath: string): Promise<string> {
    try {
        return await fs.readFile(filePath, "utf8");
    } catch (err: any) {
        if (err?.code === "ENOENT") {
            return "";
        }
        throw err;
    }
}

/**
 * Writes content to file, checking if content already exists to avoid unnecessary writes.
 */
export async function writeFileIfChanged(filePath: string, content: string): Promise<void> {
    try {
        const existing = await fs.readFile(filePath, "utf8");
        if (existing.trim() === content.trim()) {
            return;
        }
    } catch (err: any) {
        if (err?.code !== "ENOENT") {
            throw err;
        }
    }

    await fs.writeFile(filePath, content, "utf8");
}

/**
 * Safely removes a file, ignoring if it doesn't exist.
 */
export async function removeFileIfExists(filePath: string): Promise<void> {
    try {
        await fs.unlink(filePath);
    } catch (err: any) {
        if (err?.code !== "ENOENT") {
            throw err;
        }
    }
}
