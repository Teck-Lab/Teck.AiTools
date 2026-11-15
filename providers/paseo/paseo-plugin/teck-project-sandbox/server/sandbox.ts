import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PaseoApi } from "@getpaseo/client";

function provisionScript() {
  const home = process.env.PASEO_HOME;
  if (!home) throw Error("PASEO_HOME is unavailable to the plugin subprocess");
  const config = JSON.parse(readFileSync(join(home, "config.json"), "utf8")) as {
    plugins?: Record<string, { path?: string }>;
  };
  const source = config.plugins?.["teck-project-sandbox"]?.path;
  if (!source) throw Error("The project sandbox plugin source path is unavailable");
  const script = resolve(source, "..", "..", "scripts", "project.mjs");
  if (!existsSync(script)) throw Error(`Project sandbox provisioner is missing: ${script}`);
  return script;
}
type Result = { projectId: string; sandboxName: string; sandboxId: string; sshUri: string; projectRoot: string };
type Job = {
  id: string; projectId: string; projectName: string; path: string;
  phase: "provisioning" | "connecting" | "ready" | "failed";
  message: string; output: string; result?: Result; serverId?: string; workspaceId?: string;
  child?: ChildProcessWithoutNullStreams;
};
const jobs = new Map<string, Job>();

async function project(paseo: PaseoApi, projectId: string) {
  const { projects } = await paseo.projects.list();
  const found = projects.find(item => item.projectId === projectId);
  if (!found) throw Error("Project is no longer registered on this Paseo host");
  if (found.projectKind !== "git") throw Error("Docker sandbox creation currently requires a Git project");
  return found;
}

export async function projects(paseo: PaseoApi) {
  const result = await paseo.projects.list();
  return { projects: result.projects.map(item => ({
    id: item.projectId,
    name: item.projectCustomName || item.projectDisplayName,
    path: item.projectRootPath,
    kind: item.projectKind,
  })) };
}

export async function start(paseo: PaseoApi, projectId: string) {
  const selected = await project(paseo, projectId);
  const existing = [...jobs.values()].find(job => job.projectId === projectId &&
    (job.phase === "provisioning" || job.phase === "connecting"));
  if (existing) return { jobId: existing.id };
  const script = provisionScript();
  const job: Job = { id: randomUUID(), projectId, projectName: selected.projectCustomName || selected.projectDisplayName,
    path: selected.projectRootPath, phase: "provisioning", message: "Creating or waking the project sandbox", output: "" };
  jobs.set(job.id, job);
  const child = spawn("node", [script, "provision-path", job.path], { windowsHide: true });
  job.child = child;
  const collect = (chunk: Buffer) => { job.output = (job.output + chunk.toString()).slice(-16000); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.on("error", error => { job.phase = "failed"; job.message = error.message; });
  child.on("close", code => {
    if (job.phase === "failed") return;
    const match = /TECK_PASEO_RESULT=(\{[^\r\n]+\})/.exec(job.output);
    if (code !== 0 || !match) {
      job.phase = "failed";
      job.message = job.output.trim().split(/\r?\n/).slice(-5).join("\n") || `Provisioner exited with code ${code}`;
      return;
    }
    try {
      job.result = JSON.parse(match[1]) as Result;
      job.phase = "connecting";
      job.message = "Connecting Paseo to the project sandbox";
    } catch (error) {
      job.phase = "failed";
      job.message = String(error);
    }
  });
  return { jobId: job.id };
}

export async function status(paseo: PaseoApi, jobId: string) {
  const job = jobs.get(jobId);
  if (!job) throw Error("Sandbox job is no longer available. Select the project again to resume.");
  if (job.phase === "connecting" && job.result) {
    const { sshUri, projectRoot, projectId, sandboxId } = job.result;
    try {
      const directory = await paseo.hosts.list();
      const candidates = directory.hosts.filter(item => item.metadata["teck.projectId"] === projectId ||
        item.targetDescription.startsWith(sshUri + " "));
      if (candidates.length > 1) throw Error("Several Paseo hosts claim the same project sandbox");
      let host = candidates[0];
      if (host && !host.targetDescription.startsWith(sshUri + " ")) {
        job.phase = "failed";
        throw Error("The registered host points to a different project sandbox");
      }
      if (host?.metadata["teck.sandboxId"] && host.metadata["teck.sandboxId"] !== sandboxId) {
        job.phase = "failed";
        throw Error("The registered host sandbox identity changed");
      }
      if (!host) host = await paseo.hosts.add({ connection: sshUri, label: `Teck.Paseo ${job.projectName}`,
        metadata: { "teck.projectId": projectId, "teck.sandboxId": sandboxId }, sourceKey: projectId });
      if (!host.enabled) { job.phase = "failed"; throw Error("The project sandbox host is disabled in Paseo"); }
      if (host.status === "error") { job.phase = "failed"; throw Error(host.error?.message || "Sandbox host connection failed"); }
      if (host.status === "online" && host.serverId) {
        const remote = await paseo.hosts.client(host.serverId);
        try {
          const workspace = await remote.workspaces.open(projectRoot);
          job.serverId = host.serverId;
          job.workspaceId = workspace.id;
          job.phase = "ready";
          job.message = "Project sandbox ready";
        } finally { await remote.dispose(); }
      }
    } catch (error) {
      job.message = job.phase === "failed" ? String(error) : `Waiting for sandbox host: ${String(error)}`;
    }
  }
  return { phase: job.phase, message: job.message, serverId: job.serverId, workspaceId: job.workspaceId };
}

export function stopJobs() {
  for (const job of jobs.values()) job.child?.kill();
  jobs.clear();
}
