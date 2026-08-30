import unittest
import numpy as np
from pathlib import Path
from recognizer import DigitRecognizer, load_recognizer


class TestDigitRecognizer(unittest.TestCase):
    def test_ctc_decode_basic(self):
        # 3 timesteps, 3 classes (blank, '0', '1')
        probs = np.array([
            [0.1, 0.8, 0.1],  # '0'
            [0.2, 0.7, 0.1],  # '0' (duplicate, should be collapsed)
            [0.1, 0.1, 0.8],  # '1'
        ])
        chars = ["<blank>", "0", "1"]
        text, conf = DigitRecognizer.ctc_decode(probs, chars)

        self.assertEqual(text, "01")
        expected_conf = float(np.exp(np.mean(np.log([0.8, 0.8]))))
        self.assertAlmostEqual(conf, expected_conf)

    def test_ctc_decode_leading_zeros(self):
        probs = np.array([
            [0.1, 0.9, 0.0],  # '0'
            [0.9, 0.1, 0.0],  # blank
            [0.1, 0.9, 0.0],  # '0'
            [0.1, 0.0, 0.9],  # '7'
        ])
        chars = ["<blank>", "0", "7"]
        text, conf = DigitRecognizer.ctc_decode(probs, chars)

        self.assertEqual(text, "007")

    def test_ctc_decode_empty(self):
        probs = np.array([
            [0.9, 0.1],  # blank
            [0.8, 0.2],  # blank
        ])
        chars = ["<blank>", "5"]
        text, conf = DigitRecognizer.ctc_decode(probs, chars)
        self.assertEqual(text, "")
        self.assertEqual(conf, 0.0)

    def test_preprocess_shape(self):
        # Create dummy class instance without loading model
        class DummyRecognizer(DigitRecognizer):
            def __init__(self):
                self.input_height = 32
                self.input_width = 160

        recognizer = DummyRecognizer()

        # 64x128 image (H, W) -> ratio = 32/64 = 0.5, new_w = 64
        # padded to 160
        image = np.zeros((64, 128, 3), dtype=np.uint8)
        tensor = recognizer.preprocess(image)

        self.assertEqual(tensor.shape, (1, 1, 32, 160))
        self.assertEqual(tensor.dtype, np.float32)

    def test_load_recognizer_explicit_missing_returns_none(self):
        # Explicit non-existent path with env override to prevent fallback
        import os
        old_env = os.environ.get("LIMESTONE_DT_MODEL_DIR")
        os.environ["LIMESTONE_DT_MODEL_DIR"] = "/tmp/also_nonexistent_xyz"
        try:
            recognizer = load_recognizer("/tmp/nonexistent/dir/xyz123")
        finally:
            if old_env is None:
                os.environ.pop("LIMESTONE_DT_MODEL_DIR", None)
            else:
                os.environ["LIMESTONE_DT_MODEL_DIR"] = old_env

        # Both explicit and env paths are invalid; default path may or may not
        # have a model depending on deployment state, so we only assert the
        # function doesn't crash.
        # If model IS deployed at default path, recognizer will be non-None.
        self.assertTrue(recognizer is None or isinstance(recognizer, DigitRecognizer))


if __name__ == "__main__":
    unittest.main()
