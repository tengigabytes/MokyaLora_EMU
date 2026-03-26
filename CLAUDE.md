# CLAUDE.md

This file provides guidance for AI assistants (Claude Code and similar tools) working in this repository.

## Repository Overview

**Repository:** `tengigabytes/CldTest`
**Description:** A test/scratch repository used for experimenting with Claude Code workflows, GitHub integrations, and AI-assisted development.

## Repository State

This repository is currently in early initialization. At time of writing it contains only:
- `README.md` — placeholder title only
- `CLAUDE.md` — this file

There is no established application framework, language, or build system yet. When code is added, update this file to reflect the stack.

## Git Workflow

### Branch Naming

AI-generated feature branches follow the convention:

```
claude/<short-description>-<random-suffix>
```

Example: `claude/add-claude-documentation-CtwyZ`

### Commit Signing

Commits are signed using SSH keys. Do not bypass signing with `--no-gpg-sign` or similar flags.

### Push Convention

Always push with the upstream tracking flag:

```bash
git push -u origin <branch-name>
```

If a push fails due to a transient network error, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s). Do not retry on permanent errors (authentication, permissions).

### Branch Scope

- Develop all changes on the designated feature branch
- Never push to `main` or `master` directly
- Do not create a pull request unless the user explicitly requests one

## GitHub Interactions

All GitHub interactions (issues, PRs, comments, file contents) must go through the MCP GitHub tools (`mcp__github__*`). Do not use `gh` CLI or direct API calls.

Repository scope is restricted to `tengigabytes/CldTest`. Do not interact with other repositories.

## Development Conventions (To Be Updated)

When a language and framework are chosen, document the following here:

- **Language & runtime version**
- **Dependency management** (install command, lockfile policy)
- **How to run the app** locally
- **How to run tests** (command, coverage expectations)
- **Linting & formatting** (commands, auto-fix vs. CI-only)
- **Build process** (if applicable)
- **Environment variables** (required vs. optional, `.env.example` location)

## General AI Assistant Guidelines

- Read files before modifying them
- Prefer editing existing files over creating new ones
- Do not add features, refactors, or cleanup beyond what was explicitly requested
- Do not add comments or docstrings to code you did not change
- Avoid introducing security vulnerabilities (injection, XSS, insecure defaults)
- Do not add error handling for scenarios that cannot occur
- Do not add backwards-compatibility shims or unused exports
- Keep changes minimal and scoped to the task at hand
- Confirm with the user before destructive or irreversible git operations (force push, reset --hard, branch deletion)
- Confirm before actions visible to others (pushing, opening PRs, posting comments)

## Updating This File

Keep this file current as the project evolves. Update it when:
- A language, framework, or build tool is adopted
- Test or lint commands change
- New conventions are established
- The project purpose changes significantly
