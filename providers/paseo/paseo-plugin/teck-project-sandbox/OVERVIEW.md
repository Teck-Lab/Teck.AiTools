Teck project sandboxes creates or reuses a long lived Docker Sandbox for each Git project registered on the local Paseo daemon. Choose a project in the sidebar screen or Command Center action. The plugin provisions the guest, connects it as a Paseo host, and opens its project workspace.

This is a local Windows plugin for the Teck.Paseo source checkout. It requires Docker Sandboxes, Node, Git, SSH, and the source kits in that checkout. Each guest uses the published `@omercnet/paseo-omp` plugin. A local Git repository without an origin is copied into its sandbox on first creation. The plugin reads project paths and Git origins from the local daemon and stores sandbox ownership records under the user's local application data.

Paseo's native New workspace host picker remains independent of project selection. Use this plugin's project action to reach the matching sandbox.
