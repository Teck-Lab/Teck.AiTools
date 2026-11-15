import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { listProjects, startSandbox, sandboxStatus } from "../shared/sandbox";

type Project = { id: string; name: string; path: string; kind: string };

export function SandboxScreen({ theme, layout, navigation }: PluginScreenProps) {
  const list = useRpc(listProjects);
  const start = useRpc(startSandbox);
  const status = useRpc(sandboxStatus);
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading Paseo projects...");
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    void list({}).then(result => {
      if (!active) return;
      setProjects(result.projects);
      setMessage(result.projects.length ? "Select a project to create or reuse its Docker Sandbox." : "No projects are registered on this host.");
    }).catch(error => { if (active) setMessage(String(error)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const check = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const result = await status({ jobId });
        if (!active) return;
        setMessage(result.message);
        if (result.phase === "ready" && result.serverId && result.workspaceId) {
          setJobId(null);
          navigation?.openWorkspace({ serverId: result.serverId, workspaceId: result.workspaceId });
        } else if (result.phase === "failed") setJobId(null);
      } catch (error) { if (active) { setMessage(String(error)); setJobId(null); } }
      finally { busy.current = false; }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 2500);
    return () => { active = false; clearInterval(timer); };
  }, [jobId]);

  const choose = async (project: Project) => {
    if (jobId) return;
    setSelected(project.id);
    setMessage(`Preparing ${project.name}...`);
    try { setJobId((await start({ projectId: project.id })).jobId); }
    catch (error) { setMessage(String(error)); }
  };
  const pad = layout.compact ? 16 : 24;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: pad, gap: 12 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "600" }}>Project sandboxes</Text>
      <Text style={{ color: theme.colors.foregroundMuted }}>{message}</Text>
      {projects.map(project => (
        <Pressable key={project.id} accessibilityRole="button" accessibilityLabel={`Open sandbox for ${project.name}`}
          disabled={Boolean(jobId) || project.kind !== "git"} onPress={() => { void choose(project); }}
          style={{ borderColor: theme.colors.border, borderWidth: 1, borderRadius: 10, padding: 14,
            opacity: project.kind === "git" ? 1 : 0.5, backgroundColor: selected === project.id ? theme.colors.surface1 : theme.colors.surface0 }}>
          <View style={{ gap: 4 }}>
            <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>{project.name}</Text>
            <Text style={{ color: theme.colors.foregroundMuted }}>{project.path}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
