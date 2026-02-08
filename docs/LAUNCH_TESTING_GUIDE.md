# SimpleStats Launch Testing Guide

## Purpose
This guide is the release gate for SimpleStats launch validation.

Pass criteria:
1. All `P0` and `P1` cases pass.
2. No crash, hang, or data corruption in plugin or helper.
3. No open `P0/P1` defects.

## Test Priorities
1. `P0` Blocker: crashes, helper lifecycle failures, broken core metrics, install/load failures.
2. `P1` High: incorrect values, PI setting persistence failures, rescan failures, severe performance regressions.
3. `P2` Medium: cosmetic issues, minor layout problems, non-critical data delays.

## Environment Matrix
Validate at least these combinations before launch:

| ID | OS | Stream Deck | Hardware Profile | Priority |
|---|---|---|---|---|
| ENV-01 | Windows 11 23H2+ | 6.9+ | NVIDIA GPU + multiple disks + Ethernet/Wi-Fi | P0 |
| ENV-02 | Windows 10 (Build 10240+) | 6.9+ | No NVIDIA GPU | P0 |
| ENV-03 | Windows 11 | 6.9+ | Removable USB drive available | P1 |
| ENV-04 | Windows 11 | 6.9+ | VPN/virtual adapter installed | P1 |

## Pre-Launch Build Validation
Run before manual validation:

1. `cmd /c "npm run build"`
2. `dotnet build native/SimpleStatsHelper/SimpleStatsHelper.csproj -c Debug`
3. Confirm plugin bundle exists: `com.crest.simplestats.sdPlugin/bin/plugin.js`
4. Confirm helper exists: `com.crest.simplestats.sdPlugin/bin/SimpleStatsHelper.exe`

## Core Smoke Tests (P0)

| ID | Test | Steps | Expected |
|---|---|---|---|
| SMK-01 | Plugin loads | Start Stream Deck app with plugin installed. | Plugin category and action appear with no errors. |
| SMK-02 | Metric action render | Add `Metric Display` to a key. | Key renders metric tile; no blank/hung key. |
| SMK-03 | All groups basic render | For one key each, set CPU/GPU/Memory/Disk/Network/System. | All groups render expected label/value format. |
| SMK-04 | Setting persistence | Configure non-default values, restart Stream Deck app. | Settings persist and tiles restore correctly. |
| SMK-05 | Legacy action compatibility | Add legacy action UUIDs from existing profile. | Legacy keys map to correct default metrics. |

## Helper Lifecycle Tests (P0)

| ID | Test | Steps | Expected |
|---|---|---|---|
| HLP-01 | No helper with no actions | Start app with no SimpleStats keys on any page/profile. | `SimpleStatsHelper.exe` is not running. |
| HLP-02 | Helper starts with active key | Add one non-system metric key. | Helper starts and metrics populate. |
| HLP-03 | Helper stops when idle | Remove last helper-backed key (CPU/GPU/Memory/Disk/Network). | Helper stops within normal polling window. |
| HLP-04 | System-only keys | Keep only `System -> Clock` keys visible. | Clock updates; helper remains stopped. |
| HLP-05 | Page/profile transitions | Move between pages/profiles with and without helper-backed keys. | Helper state follows active interest correctly; no orphan process. |

## Property Inspector Tests (P0/P1)

| ID | Test | Steps | Expected |
|---|---|---|---|
| PI-01 | No listener multiplication | Open/close PI 10+ times on same key; click rescan once. | Single rescan request per click, no burst duplication. |
| PI-02 | Group/metric updates | Change group and metric repeatedly. | UI state updates correctly; no stuck fields; no duplicate writes. |
| PI-03 | CPU core controls | Toggle per-core, use stepper up/down and text input. | Values clamp correctly and persist. |
| PI-04 | Poll interval bounds | Enter out-of-range values. | Values normalize to 1..5 and persist normalized value. |
| PI-05 | Threshold fields | Set `Alert %` and `Idle below` including 0/empty. | Behavior matches threshold definitions and persists. |

## Disk Enumeration / Rescan Tests (P0/P1)

| ID | Test | Steps | Expected |
|---|---|---|---|
| DSK-01 | Startup disk list | Open PI on disk metric immediately after app launch. | Disk list is populated without manual restart. |
| DSK-02 | Manual rescan | Attach/remove removable drive, click disk rescan button. | List refreshes immediately and reflects change. |
| DSK-03 | Stale refresh | Keep app running >10 minutes without rescan. | Disk cache refreshes on schedule; no stale permanent list. |
| DSK-04 | Disk space cadence | Track `% Used`/`% Free` tiles over time. | Refresh cadence follows slow-update behavior (~60s). |

## Network Tests (P0/P1)

| ID | Test | Steps | Expected |
|---|---|---|---|
| NET-01 | Upload/download rates | Generate traffic and observe net up/down keys. | Rates react in near-real-time with sane units. |
| NET-02 | Transfer windows | Validate 60s/60m/24h windows. | Totals change according to selected window. |
| NET-03 | Insufficient history behavior | Start app and check net total immediately. | May show `0B` until at least two samples exist. |
| NET-04 | Interface filtering | Check interface list with virtual/loopback adapters present. | Internal/loopback filtered as intended; usable interfaces listed. |

## GPU / Memory / Top Process Tests (P1)

| ID | Test | Steps | Expected |
|---|---|---|---|
| GPU-01 | NVIDIA metrics | On NVIDIA machine, validate load/VRAM/temp/power. | Values update and stay stable; no placeholder lock-up. |
| GPU-02 | Non-NVIDIA fallback | On non-NVIDIA machine, select GPU metrics. | Graceful unavailable behavior (`--`), no crash. |
| TOP-01 | Top CPU idle gating | Set `Idle below` and vary CPU load. | Shows `IDLE` below threshold, process/value above threshold. |
| TOP-02 | Top MEM and TOP MEM % | Vary memory pressure and threshold. | Correct process attribution and threshold gating behavior. |

## Reliability / Recovery Tests (P0/P1)

| ID | Test | Steps | Expected |
|---|---|---|---|
| REL-01 | Stream Deck restart | Restart Stream Deck while keys exist. | Plugin recovers and keys resume updates. |
| REL-02 | Rapid setting churn | Change settings quickly for 60s. | No crash, no runaway CPU, settings remain coherent. |
| REL-03 | Helper restart tolerance | Stop helper process externally while keys active. | Plugin recovers and resumes metrics after helper restart. |
| REL-04 | Long run soak | Leave 10+ keys active for 2+ hours. | No memory growth runaway, no stuck updates. |

## Performance Tests (P1)

| ID | Test | Steps | Expected |
|---|---|---|---|
| PERF-01 | Idle overhead | No keys active for 10 minutes. | Minimal plugin activity; helper not running. |
| PERF-02 | Active overhead | 10-15 mixed metric keys active. | UI remains responsive; no severe Stream Deck lag. |
| PERF-03 | PI interaction overhead | Repeated PI open/close and rescans. | No progressive slowdown from listener accumulation. |

## Compatibility / UX Tests (P1/P2)

| ID | Test | Steps | Expected |
|---|---|---|---|
| UX-01 | Key readability | Validate labels/values on physical key device. | Text and graph remain readable across metric types. |
| UX-02 | Warning color | Exceed `Alert %` threshold on percent metric. | Value and graph line turn red. |
| UX-03 | Unsupported OS message | Run below required Windows version (if available in test lab). | Shows `WIN10+ REQ` state cleanly. |

## Logging Checks
Inspect `com.crest.simplestats.sdPlugin/debug.log` during test runs.

Required checks:
1. No repeated unexpected helper restart loop.
2. No repeated parse/buffer errors.
3. Rescan command events appear when disk rescan is clicked.
4. No flood of duplicate PI events from single UI action.

## Defect Triage Template
Use this template for each issue:

1. `ID`: BUG-###
2. `Severity`: P0/P1/P2
3. `Environment`: ENV-##
4. `Test Case`: table ID above
5. `Repro Steps`: exact numbered steps
6. `Expected`: one sentence
7. `Actual`: one sentence
8. `Artifacts`: screenshot + relevant `debug.log` lines
9. `Regression`: yes/no + last known good commit

## Launch Sign-Off Checklist

1. All `P0` test cases pass.
2. At least one full environment from each `P0` matrix row is green.
3. No open `P0/P1` bugs.
4. Build commands pass.
5. Final packaged plugin tested on clean machine profile.
6. Release notes match actual behavior (`Alert %` single threshold, net totals `0B` early-window behavior).
