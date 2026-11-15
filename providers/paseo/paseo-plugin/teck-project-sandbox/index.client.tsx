import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { SandboxScreen } from "./client/sandbox-screen";

function SandboxItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Box"
      label="Project sandboxes"
      active={currentScreen?.screenId === "sandboxes"}
      onPress={() => openScreen({ screenId: "sandboxes" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "sandboxes", title: "Project sandboxes", Component: SandboxScreen });
  client.addSidebarHeaderItem({ id: "sandboxes", title: "Project sandboxes", Component: SandboxItem });
  client.addCommandCenterItem({ id: "project-sandbox", title: "Create or open project sandbox", icon: "Box", context: "global",
    onSelect({ openScreen }) { openScreen({ screenId: "sandboxes" }); } });
  return () => {};
}
