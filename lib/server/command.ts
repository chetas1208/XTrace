import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  error: string | null;
}

export function runCommand(command: string, args: string[], timeoutMs = 30000): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let finished = false;
    let timedOut = false;
    let spawnError: string | null = null;

    const finish = (exitCode: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode,
        timedOut,
        error: spawnError,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      finish(null);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      spawnError = error.message;
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}
