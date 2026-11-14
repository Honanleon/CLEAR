# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Compare radar detections with OPERA DIST-ALERT optical alerts.

agreement = % of radar-flagged area that has an optical alert;
coverage  = % of optical-alert area (forest, patches >= min_area_ha) that the radar flagged;
lag       = radar detection date minus optical first-disturbance date, in days (negative = radar earlier).
Each is computed spatially (any date in the analysis period) and, as in CLAUDE.md, with a +-tol_days window.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from scipy import ndimage

from pipeline.process.detect import NO_DETECTION


def alert_mask(status: np.ndarray, days: np.ndarray, d0: int, d1: int, statuses: Sequence[int]) -> np.ndarray:
    """Optical alert pixels: wanted status and first-disturbance day within [d0, d1]."""
    return np.isin(status, statuses) & (days >= d0) & (days <= d1)


def drop_small(mask: np.ndarray, px_ha: float, min_area_ha: float) -> np.ndarray:
    """Remove 8-connected patches smaller than min_area_ha."""
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return mask.copy()
    sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1)) * px_ha
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= min_area_ha
    return keep[lab]


def compare(
    first: np.ndarray,
    radar_days: Sequence[int],
    alert: np.ndarray,
    alert_days: np.ndarray,
    tol_days: int,
) -> dict[str, float | int | None]:
    """Agreement/coverage (spatial and within +-tol_days) and the median lag.

    `first` holds date indexes into `radar_days` (NO_DETECTION elsewhere); `alert` is the optical alert mask.
    """
    flagged = first != NO_DETECTION
    rd = np.full(first.shape, np.iinfo(np.int32).min, dtype=np.int64)
    rd[flagged] = np.asarray(radar_days, dtype=np.int64)[first[flagged]]
    both = flagged & alert
    near = both & (np.abs(rd - alert_days.astype(np.int64)) <= tol_days)

    def pct(num: int, den: int) -> float | None:
        return round(100.0 * num / den, 1) if den else None

    lag = (rd - alert_days.astype(np.int64))[both]
    return {
        "agreement_pct": pct(int(both.sum()), int(flagged.sum())),
        "agreement_pct_tol": pct(int(near.sum()), int(flagged.sum())),
        "coverage_pct": pct(int(both.sum()), int(alert.sum())),
        "coverage_pct_tol": pct(int(near.sum()), int(alert.sum())),
        "median_lag_days": int(np.median(lag)) if lag.size else None,
        "radar_px": int(flagged.sum()),
        "alert_px": int(alert.sum()),
    }


def polygon_confirmed(labels: np.ndarray, alert: np.ndarray, n: int, min_frac: float = 0.2) -> list[bool]:
    """For polygon labels 1..n: True if at least `min_frac` of its pixels have an optical alert."""
    if n == 0:
        return []
    frac = ndimage.mean(alert.astype(np.float32), labels, index=np.arange(1, n + 1))
    return [bool(f >= min_frac) for f in np.atleast_1d(frac)]
