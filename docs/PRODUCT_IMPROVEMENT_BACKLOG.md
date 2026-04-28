# Product Improvement Backlog

This document keeps product and analytics ideas close to the public codebase
without mixing them into operator-only deployment notes.

## Active baseline

- Cycling power and running best efforts use cache-first API endpoints.
- Running best efforts reject implausible GPS rolling segments and expose a
  quality badge (`high`, `medium`, `low`) plus confidence score.
- User-visible changes must be represented in:
  - SemVer package version
  - `dashboards/strava/src/lib/featureLog.ts`
  - website metadata on cyclenoid.com

## Priority 1: Current vs. all-time context

Problem:
- Records and power views show strong all-time values, but the user has to
  infer whether current form is improving or declining.

Implementation idea:
- Add current-window comparisons for 30, 90, and 365 days.
- Show delta against all-time and previous matching window.
- Use the same data model for cycling power and running best efforts.

Expected UI:
- Compact badges on existing record cards, for example `+4% vs 90d`.
- Toggle between `All-time`, `This year`, `Last 90 days`.
- Keep the existing all-time view as default.

## Priority 2: Insights feed

Problem:
- Important changes are spread across pages, so users need to inspect several
  charts to notice relevant trends.

Implementation idea:
- Generate a lightweight insights feed from existing cached metrics.
- Start deterministic, no AI dependency:
  - new all-time best
  - best value in the last 90 days
  - volume up/down versus previous period
  - fatigue signal from declining pace/power at similar heart rate

Expected UI:
- Dashboard panel with 3 to 5 concise insights.
- Link each insight to the source page or activity.
- Rank by recency and impact.

## Priority 3: Data quality and cache visibility

Problem:
- Long-running calculations are cached, but users cannot always see whether a
  value is fresh, cached, or filtered.

Implementation idea:
- Surface generated timestamp, cached status, and filtered-candidate count where
  analytics depend on derived segments.
- Use a shared small status component for running best efforts and power curves.

Expected UI:
- Small muted line below charts: `Cache refreshed ...`, `GPS outliers filtered`.
- Quality badges stay visible only where they help interpret a specific value.

## Priority 4: Better training metrics

Ideas:
- Pace or power at fixed heart-rate bands.
- Efficiency trend: pace per heart-rate for running, watts per heart-rate for
  cycling.
- Climbing quality: VAM normalized by climb duration and grade.
- Consistency score across weekly volume, intensity, and active days.

## Priority 5: UX refinements

Ideas:
- Preserve selected sport and time window across pages.
- Add quick filters for race-like efforts versus normal training.
- Improve empty/loading states for analytics that are cache-building in the
  background.
- Keep cards dense and scan-friendly; avoid new decorative layouts for
  operational views.

## Release rule

Each shipped improvement needs:
- one feature-log entry
- package version bump
- deployment verification via `/api/capabilities`
- cyclenoid.com metadata refresh
- screenshot refresh only when UI/UX meaningfully changed
