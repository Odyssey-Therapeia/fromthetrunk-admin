---
name: general-behavior
description: General behavior rules for code generation and modification. Use whenever writing, modifying, or suggesting code changes. Enforces investigation-first workflow, descriptive naming, robust error handling, environment variable management, and workspace-relative operations. Always use this skill alongside any coding task.
---

# General Behavior Rules

When creating or modifying code, always follow these rules:

## Investigation First

- Do not make assumptions about the problem or the codebase. Always investigate and validate the codebase and context before making suggestions or modifications.
- Use Glob to find files, Grep to search content, and Read to examine files before proposing changes.
- Run `pwd` and `ls` via Bash when you need to understand the workspace layout.

## Code Standards

- Prioritize straightforward and simple code solutions.
- Always prefer existing solutions over creating new ones. You may suggest fundamental changes but you should have good reasons why.
- Always use descriptive variable names.
- Manage configurations with environment variables.
- Ensure robust error handling and logging, include rich context in error messages.
- Document code with type hints and docstrings (detailed and concise).
- Use assertions to guarantee code functionality where appropriate.

## Environment & Workspace

- Always use a virtual environment for Python projects (do not install anything in global pip).
- Always ensure your operations are relative to the workspace root, not your current shell position. Use absolute paths or verify your working directory before file operations.
