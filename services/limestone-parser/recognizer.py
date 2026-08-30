import json
import os
from pathlib import Path

import cv2
import numpy as np


class DigitRecognizer:
    """ONNX-based CRNN digit sequence recognizer for handwritten No. DT and retase fields.

    Loads a PaddleOCR-exported ONNX recognition model and performs CTC-decoded
    inference on cropped cell images. Character set is digit-only (0-9).
    Leading zeros are preserved (e.g. '07' is NOT normalized to '7').
    """

    def __init__(self, model_dir: Path):
        self.model_dir = Path(model_dir)
        model_path = self.model_dir / "model.onnx"
        dict_path = self.model_dir / "digit_dict.txt"
        config_path = self.model_dir / "config.json"

        if not model_path.exists() or not dict_path.exists() or not config_path.exists():
            raise FileNotFoundError(f"Missing required model files in {self.model_dir}")

        import onnxruntime as ort
        self.session = ort.InferenceSession(str(model_path))

        # Build index -> char mapping
        with open(dict_path, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        # Add blank token at index 0 for CTC
        self.chars = ["<blank>"] + lines

        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
            self.input_height = config.get("input_height", 32)
            self.input_width = config.get("input_width", 160)

        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    def preprocess(self, image: np.ndarray) -> np.ndarray:
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        h, w = gray.shape
        ratio = self.input_height / h
        new_w = max(1, int(w * ratio))
        new_w = min(new_w, self.input_width)
        resized = cv2.resize(gray, (new_w, self.input_height))

        # Pad right to fixed input width with white (255)
        canvas = np.full((self.input_height, self.input_width), 255, dtype=np.uint8)
        canvas[:, :new_w] = resized

        # Normalize to [-1, 1]
        normalized = canvas.astype(np.float32) / 255.0
        standardized = (normalized - 0.5) / 0.5

        # Reshape to (1, 1, H, W) float32 tensor
        tensor = standardized.reshape(1, 1, self.input_height, self.input_width)
        return tensor

    def predict(self, image: np.ndarray) -> tuple[str, float]:
        tensor = self.preprocess(image)
        outputs = self.session.run([self.output_name], {self.input_name: tensor})
        logits = outputs[0][0]  # Shape: (T, num_classes) — raw logits
        # Apply softmax to convert logits to probabilities
        exp = np.exp(logits - np.max(logits, axis=1, keepdims=True))
        probs = exp / np.sum(exp, axis=1, keepdims=True)
        return self.ctc_decode(probs, self.chars)

    @staticmethod
    def ctc_decode(probs: np.ndarray, chars: list[str]) -> tuple[str, float]:
        T = probs.shape[0]
        preds = np.argmax(probs, axis=1)

        decoded = []
        confidences = []

        for t in range(T):
            idx = preds[t]
            # Ignore blank (0) and consecutive duplicates
            if idx != 0 and not (t > 0 and idx == preds[t-1]):
                decoded.append(chars[idx])
                confidences.append(probs[t, idx])

        text = "".join(decoded)
        if not text:
            return "", 0.0

        # Geometric mean
        confidence = float(np.exp(np.mean(np.log(confidences))))
        return text, confidence


def load_recognizer(model_dir: Path | str | None = None) -> DigitRecognizer | None:
    """Try to load digit recognizer from model_dir or default locations.

    Search order:
    1. Explicit model_dir argument
    2. LIMESTONE_DT_MODEL_DIR environment variable
    3. models/dt_recognizer/ relative to this file

    Returns None if no model found (parser falls back to Tesseract).
    """
    try:
        import onnxruntime
    except ImportError:
        return None

    paths_to_check = []

    if model_dir is not None:
        paths_to_check.append(Path(model_dir))

    env_dir = os.environ.get("LIMESTONE_DT_MODEL_DIR")
    if env_dir:
        paths_to_check.append(Path(env_dir))

    paths_to_check.append(Path(__file__).parent / "models" / "dt_recognizer")

    for path in paths_to_check:
        try:
            return DigitRecognizer(path)
        except FileNotFoundError:
            continue

    return None
