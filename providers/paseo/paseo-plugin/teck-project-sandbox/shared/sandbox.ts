import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const listProjects = defineRpc({
  name: "sandbox.projects",
  input: z.object({}),
  output: z.object({ projects: z.array(z.object({ id: z.string(), name: z.string(), path: z.string(), kind: z.string() })) }),
});

export const startSandbox = defineRpc({
  name: "sandbox.start",
  input: z.object({ projectId: z.string() }),
  output: z.object({ jobId: z.string() }),
});

export const sandboxStatus = defineRpc({
  name: "sandbox.status",
  input: z.object({ jobId: z.string() }),
  output: z.object({
    phase: z.enum(["provisioning", "connecting", "ready", "failed"]),
    message: z.string(),
    serverId: z.string().optional(),
    workspaceId: z.string().optional(),
  }),
});
