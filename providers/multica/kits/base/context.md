# Teck shared sandbox

This long-lived Docker Sandbox runs the Multica daemon and official OMP. Multica projects select repositories; this sandbox is not owned by a single project. Keep changes in Multica-managed work directories and use the issue context to identify the repository.

Use GitHub MCP tools for GitHub reads and writes. Commit and publish repository file changes through the GitHub MCP (`push_files` or `create_or_update_file`) so the GitHub App is the author. Local `git` is for read-only status, diff, and history; do not use `git commit`, `git push`, or `gh` for GitHub operations.
