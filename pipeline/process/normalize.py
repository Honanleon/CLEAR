# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Per-date normalization: subtract the median HV (dB) of the forest pixels of the AOI.

Over the series (up to about 11 months) almost all forest stays unchanged, so the forest median tracks rain
and calibration differences (e.g. PROVISIONAL vs VALIDATED) rather than clearing.
"""

from __future__ import annotations

import numpy as np


def forest_medians(stack_db: np.ndarray, forest: np.ndarray) -> np.ndarray:
    """Median of each date (axis 0) over forest pixels, ignoring NaN."""
    if not forest.any():
        raise ValueError("forest mask is empty")
    return np.array([np.nanmedian(layer[forest]) for layer in stack_db], dtype=np.float32)


def normalize(stack_db: np.ndarray, medians: np.ndarray) -> np.ndarray:
    """stack_db minus each date's median."""
    return (stack_db - medians[:, None, None]).astype(np.float32)
