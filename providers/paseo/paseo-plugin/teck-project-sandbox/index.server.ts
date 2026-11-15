import type { PluginServerContext } from "@getpaseo/plugin/server";
import { projects, start, status, stopJobs } from "./server/sandbox";
import { listProjects, startSandbox, sandboxStatus } from "./shared/sandbox";

export default function contribute(server: PluginServerContext) {
  server.handle(listProjects, (_input, { paseo }) => projects(paseo));
  server.handle(startSandbox, ({ projectId }, { paseo }) => start(paseo, projectId));
  server.handle(sandboxStatus, ({ jobId }, { paseo }) => status(paseo, jobId));
  return stopJobs;
}
