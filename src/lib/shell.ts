import { execa, type Options as ExecaOptions } from "execa";
import ora from "ora";

export async function run(cmd: string, args: string[] = [], text?: string, sudo = false, execaOpts: ExecaOptions = {}): Promise<RunResult> {
    const fullCmd = sudo ? "sudo" : cmd;
    const fullArgs = sudo ? [cmd, ...args] : args;

    const spinner = text ? ora(text).start() : null;

    try {
        const res = await execa(fullCmd, fullArgs, {
            all: true,
            stdin: "inherit",
            stdout: "pipe",
            stderr: "pipe",
            ...execaOpts,
        });

        if (spinner) spinner.succeed(text);

        return {
            stdout: String(res.stdout ?? ""),
            stderr: String(res.stderr ?? ""),
            all: String(res.all ?? ""),
            exitCode: res.exitCode ?? 0,
        };
    } catch (err: any) {
        if (spinner) spinner.fail(`${text} failed`);

        const details = String(
            err?.stderr ?? err?.all ?? err?.shortMessage ?? err?.message ?? ""
        ).trim();

        if (details) console.error(details);

        throw err;
    }
}

export async function runCapture(cmd: string, args: string[] = [], sudo = false): Promise<string> {
    const { stdout } = await run(cmd, args, undefined, sudo);
    return stdout.trim();
}

export type RunResult = {
    stdout: string;
    stderr: string;
    all: string;
    exitCode: number;
};
