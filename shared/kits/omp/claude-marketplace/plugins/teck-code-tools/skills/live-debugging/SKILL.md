---
name: live-debugging
description: Use when a reproducible runtime bug needs breakpoints, stack frames, variables, or stepping in JavaScript or .NET code.
---

Use the plugin's `debugger` MCP server for a focused local reproduction. Start with `list_supported_languages`, then create a session, set a breakpoint near the failing path, and launch or attach to the target. Use `wait_for_stop` before reading the stack and relevant local variables. Step or evaluate only what is needed to identify the cause, then close the session.

The sandbox provides `netcoredbg` for .NET. The debugger package includes its JavaScript adapter. Build compiled code with debug symbols before launching it. Do not attach to a production process or inspect unrelated secrets.
