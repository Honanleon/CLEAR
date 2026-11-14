# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Radiometric helpers: speckle filter (on linear gamma0) and dB conversion."""

from __future__ import annotations

import numpy as np
from scipy.ndimage import uniform_filter


def boxcar_mean(a: np.ndarray, size: int) -> np.ndarray:
    """size x size moving mean that ignores NaN. Pixels with no valid neighbour stay NaN.

    Apply it to linear gamma0, before converting to dB.
    """
    if size <= 1:
        return np.asarray(a, dtype=np.float32).copy()
    a = np.asarray(a, dtype=np.float64)
    valid = np.isfinite(a)
    total = uniform_filter(np.where(valid, a, 0.0), size=size, mode="nearest")
    count = uniform_filter(valid.astype(np.float64), size=size, mode="nearest")
    with np.errstate(invalid="ignore", divide="ignore"):
        out = total / count
    out[count < 1e-9] = np.nan
    out[~valid] = np.nan  # do not invent values where the input had none
    return out.astype(np.float32)


def to_db(a: np.ndarray) -> np.ndarray:
    """10 * log10(a); 0, negative or NaN values become NaN."""
    a = np.asarray(a, dtype=np.float32)
    out = np.full(a.shape, np.nan, dtype=np.float32)
    ok = np.isfinite(a) & (a > 0)
    out[ok] = 10.0 * np.log10(a[ok])
    return out
