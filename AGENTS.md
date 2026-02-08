# Agent Coordination

Shared context file for all AI agents working on this repo. Read this before starting work. Update it when you begin or finish a task.

**All agents**: Read `CLAUDE.md` for full project architecture, tech stack, and conventions.

---

## Active Work

### Claude Code (claude-code)
**Branch:** `HelperHarden`
**Current focus:** Top-process display improvements in helper + plugin UI

**Recently completed:**
- Replaced PerformanceCounter with Win32 APIs (GetSystemTimes, NtQuerySystemInformation, IOCTL_DISK_PERFORMANCE) for instant CPU/disk perf startup (~4s vs ~93s)
- Added value-weighted momentum scoring to stabilize top-process display (reduces noise/flicker)
- Added friendly process names via FileVersionInfo.FileDescription
- Added lookup table for elevated Windows processes (Task Manager, regedit, etc.)
- Icon fallback for elevated processes using known exe paths
- Redesigned top-process key layout: icon inline with value, process name centered below

**Files actively being modified:**
- `native/SimpleStatsHelper/Program.cs` - CpuSampler, DiskPerfSampler (Win32 APIs), TopProcessSampler (momentum + friendly names), NvidiaGpuSampler (momentum + friendly names), FriendlyNameHelper, IconHelper
- `src/actions/metric.ts` - top-process SVG layout (renderProcessName, icon positioning)

### Codex
**Branch:** `HelperHarden`
**Current focus:** Release artifact automation for tagged GitHub releases (completed).

**Files actively being modified:**
- `.github/workflows/release-package.yml` - build/package/upload release asset
- `scripts/package-release.ps1` - deterministic plugin packaging script
- `package.json` - packaging script entry points
- `CLAUDE.md` - release process note requiring packaged asset

---

## Coordination Rules

1. **Check this file** before modifying any file listed under another agent's "actively being modified" section
2. **Update your section** when you start or finish a task
3. **Avoid concurrent edits** to the same file - if you need to touch a file another agent owns, note it here and coordinate
4. **Branch awareness** - if agents are on different branches, note merge considerations

## Key Architecture Notes (quick reference)

- **Helper (C#):** `native/SimpleStatsHelper/Program.cs` - all samplers in one file, emits JSON on stdout
- **Plugin (TS):** `src/actions/metric.ts` (rendering), `src/stats.ts` (polling/data)
- **PI:** `com.crest.simplestats.sdPlugin/ui/property-inspector.{html,js,css}`
- **Build:** `npm run build` (rollup) + `dotnet publish` for helper
- **Deploy:** stop plugin -> copy helper exe -> npm build -> restart plugin
- **MetricId pattern:** union type + METRICS_BY_GROUP + isMetricId() guard - all three must be updated for new metrics
- **PI mirrors TS:** PI has its own METRICS_BY_GROUP + normalizeSettings() - must stay in sync

## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.
### Available skills
- skill-creator: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations. (file: C:/Users/crest/.codex/skills/.system/skill-creator/SKILL.md)
- skill-installer: Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). (file: C:/Users/crest/.codex/skills/.system/skill-installer/SKILL.md)
### How to use skills
- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1) After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2) When `SKILL.md` references relative paths (e.g., `scripts/foo.py`), resolve them relative to the skill directory listed above first, and only consider other paths if needed.
  3) If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; don't bulk-load everything.
  4) If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  5) If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why (one short line). If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you're blocked.
  - When variants exist (frameworks, providers, domains), pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly (missing files, unclear instructions), state the issue, pick the next-best approach, and continue.
