# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
import numpy as np

from pipeline.process.calibrate import boxcar_mean, to_db


def test_to_db_values_and_invalid():
    out = to_db(np.array([1.0, 0.1, 0.0, -1.0, np.nan]))
    assert out[0] == 0.0 and np.isclose(out[1], -10.0)
    assert np.isnan(out[2:]).all()


def test_boxcar_constant_field_unchanged():
    a = np.full((10, 10), 0.05, dtype=np.float32)
    assert np.allclose(boxcar_mean(a, 5), 0.05)


def test_boxcar_ignores_nan_and_keeps_it():
    a = np.full((7, 7), 0.1, dtype=np.float32)
    a[3, 3] = np.nan
    a[3, 4] = 0.3
    out = boxcar_mean(a, 3)
    assert np.isnan(out[3, 3])  # no value invented where input was NaN
    # neighbour of the NaN: mean of its 8 valid neighbours + itself
    assert np.isclose(out[2, 3], (0.1 * 7 + 0.3) / 8)


def test_boxcar_size_one_is_identity():
    a = np.random.default_rng(0).random((5, 5)).astype(np.float32)
    assert np.array_equal(boxcar_mean(a, 1), a)
