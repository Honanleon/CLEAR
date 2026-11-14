# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Change detection: sustained drop of normalized HV against a baseline.

A pixel is flagged at date i (i >= baseline_dates) when delta <= threshold_db at date i and at
`persistence` of the dates i .. i + window - 1. Its detection date is i.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

NO_DETECTION = -1


def baseline(stack: np.ndarray, n: int) -> np.ndarray:
    """Median of the first n dates."""
    return np.nanmedian(stack[:n], axis=0).astype(np.float32)


def first_detection(
    delta: np.ndarray, threshold_db: float, persistence: int, start: int, window: int | None = None
) -> np.ndarray:
    """Index of the first date i >= start where delta[i] <= threshold and at least `persistence`
    of the dates i .. i + window - 1 are <= threshold (window defaults to `persistence`, i.e. consecutive).

    A window larger than `persistence` tolerates one date that bounces back (e.g. a wet date on bare soil).
    NaN never counts as a drop. Returns NO_DETECTION (-1) where nothing is found.
    """
    window = window or persistence
    below = np.nan_to_num(delta, nan=np.inf) <= threshold_db
    n = delta.shape[0]
    first = np.full(delta.shape[1:], NO_DETECTION, dtype=np.int16)
    for i in range(start, n):
        hits = below[i : i + window].sum(axis=0)
        ok = below[i] & (hits >= persistence) & (first == NO_DETECTION)
        first[ok] = i
    return first


@dataclass(frozen=True)
class SanityReport:
    max_median_jump_db: float
    jump_dates: tuple[str, str]
    max_flagged_pct: float
    max_flagged_date: str
    problems: tuple[str, ...]


def sanity_checks(
    dates: list[str],
    medians_db: np.ndarray,
    first: np.ndarray,
    forest: np.ndarray,
    max_jump_db: float = 2.0,
    max_flagged_pct: float = 5.0,
) -> SanityReport:
    """Heuristic checks from CLAUDE.md §9. Problems are reported; the caller decides to stop."""
    problems = []
    jumps = np.abs(np.diff(medians_db))
    j = int(np.argmax(jumps))
    if jumps[j] > max_jump_db:
        problems.append(
            f"forest HV median changes {jumps[j]:.2f} dB between {dates[j]} and {dates[j + 1]} "
            f"(> {max_jump_db} dB): check product version, calibration or rain"
        )
    n_forest = int(forest.sum())
    pct = [100.0 * np.sum((first == i) & forest) / n_forest for i in range(len(dates))]
    k = int(np.argmax(pct))
    if pct[k] > max_flagged_pct:
        problems.append(
            f"{pct[k]:.1f}% of the forest flagged on {dates[k]} (> {max_flagged_pct}%): mass false positive"
        )
    return SanityReport(float(jumps[j]), (dates[j], dates[j + 1]), float(pct[k]), dates[k], tuple(problems))
