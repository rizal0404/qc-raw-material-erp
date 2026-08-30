# DT & Retase Recognizer

This directory should contain the trained ONNX model files for the handwritten digit recognizer.

## Required Files

- `model.onnx`: The exported ONNX recognition model.
- `digit_dict.txt`: The dictionary mapping indices to characters (one per line, digits only).
- `config.json`: Configuration file containing model parameters like `input_height`.

## Notes

- These files are generated from the training dataset pipeline.
- If these files are not present, or if `onnxruntime` is not installed, the parser will gracefully fall back to using Tesseract for digit fields.
