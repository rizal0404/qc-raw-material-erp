import unittest
from unittest.mock import patch
from types import SimpleNamespace
import cv2
import numpy as np
from parser import DEFAULT_CONFIG, Extractor, align, date_value, number, parse, parser_config, shift_value

class ParserTests(unittest.TestCase):
    def test_field_aware_numbers(self):
        self.assertEqual(number("7.338 Ton","production.totalTon"),7338)
        self.assertEqual(number("5.3 Jam","production.runningTimeHours"),5.3)
        self.assertEqual(number("1.384","production.capacityTph"),1384)
        self.assertEqual(number("20,5 %","pile.baratPercent"),20.5)
        self.assertIsNone(number("-","production.fillerTon"))
        self.assertIsNone(number("???","retase"))
    def test_date_shift(self):
        self.assertEqual(date_value("18/08/2026"),"2026-08-18")
        self.assertIsNone(date_value("31/02/2026"))
        self.assertEqual(shift_value("II (DUA)"),"SHIFT_2")
        self.assertEqual(shift_value("I"),"SHIFT_1")
        self.assertIsNone(shift_value("I II"))
    def test_blank_image_never_claims_perspective_alignment(self):
        image,quality,corrected=align(np.full((600,400,3),255,dtype=np.uint8))
        self.assertFalse(corrected)
        self.assertEqual(image.shape[:2],(2200,1600))
        self.assertEqual(quality["blur"],0)

    def test_config_defaults_are_stable_and_not_shared(self):
        config = parser_config()
        self.assertEqual(config, DEFAULT_CONFIG)
        config["maxCount"] = 10
        self.assertEqual(parser_config()["maxCount"], 5000)
        self.assertEqual(parser_config({"modelConfidenceThreshold": 0})["modelConfidenceThreshold"], 0)

    def test_invalid_tuning_is_rejected_before_processing_image(self):
        for config in [[], {"systemPrompt": "not a VLM"}, {"tesseractPsm": "7"},
                       {"tesseractScale": 0}, {"tesseractScale": float("inf")},
                       {"maxCount": True}, {"maxCount": 5001}, {"maxCount": 1.5},
                       {"modelConfidenceThreshold": float("nan")},
                       {"adaptiveThresholdBlockSize": 30}, {"adaptiveThresholdBlockSize": 1},
                       {"tesseractTimeoutSeconds": 61}]:
            with self.subTest(config=config), self.assertRaises(ValueError):
                parse(b"not an image", {}, config)

    @patch("parser.load_recognizer", return_value=None)
    @patch("parser.shutil.which", return_value="tesseract")
    def test_count_and_psm_tuning_keep_raw_evidence(self, _which, _model):
        reader = Extractor(np.full((100,100,3), 255, np.uint8), ".", {"maxCount": 5, "tesseractPsm": 8})
        with patch.object(reader, "_recognize_tesseract", return_value=("7", 0.5)) as recognize:
            self.assertIsNone(reader.read("retase", [0.1,0.1,0.3,0.2], "count"))
        self.assertEqual(recognize.call_args.args[3], 8)
        self.assertEqual(reader.observations[0]["rawText"], "7")
        self.assertIsNone(reader.observations[0]["value"])
        self.assertTrue(reader.observations[0]["needsReview"])

    @patch("parser.load_recognizer", return_value=object())
    @patch("parser.shutil.which", return_value="tesseract")
    def test_model_threshold_controls_fallback_without_fabricating_values(self, _which, _model):
        reader = Extractor(np.full((100,100,3), 255, np.uint8), ".", {"modelConfidenceThreshold": 0.8})
        with patch.object(reader, "_recognize_model", return_value=("07", 0.5)), \
             patch.object(reader, "_recognize_tesseract", return_value=("09", 0.4)) as fallback:
            self.assertEqual(reader.read("dt", [0.1,0.1,0.3,0.2], "dt"), "09")
            fallback.assert_called_once()

    @patch("parser.load_recognizer", return_value=None)
    @patch("parser.shutil.which", return_value="tesseract")
    def test_timeout_and_scale_reach_tesseract(self, _which, _model):
        reader = Extractor(np.full((100,100,3), 255, np.uint8), ".", {"tesseractTimeoutSeconds": 3, "tesseractScale": 2})
        with patch("parser.cv2.imwrite") as write, \
             patch("parser.subprocess.run", return_value=SimpleNamespace(stdout="text\tconf\nhello\t80\n")) as run:
            raw, _ = reader._recognize_tesseract(reader.image, np.zeros((10,20), np.uint8), "text", 8, .2, 100)
        self.assertEqual(raw, "hello")
        self.assertEqual(write.call_args.args[1].shape, (20,40))
        self.assertEqual(run.call_args.kwargs["timeout"], 3)
        command = run.call_args.args[0]
        self.assertEqual(command[command.index("--psm") + 1], "8")

    @patch("parser.Extractor")
    def test_parse_records_effective_config_separately_from_legacy_result(self, extractor):
        reader = extractor.return_value
        reader.read.return_value = None
        reader.dt_recognizer = None
        reader.observations = []
        ok, encoded = cv2.imencode(".png", np.full((100,100,3), 255, np.uint8))
        self.assertTrue(ok)
        result = parse(encoded.tobytes(), {}, {"maxCount": 100})
        self.assertEqual(result["diagnostics"]["engine"], "LEGACY_OCR")
        self.assertEqual(result["diagnostics"]["effectiveConfig"]["maxCount"], 100)
        self.assertFalse(result["diagnostics"]["digitModelAvailable"])
        self.assertIn("draft", result["result"])
        self.assertIn("alignedBase64", result)

if __name__=="__main__": unittest.main()
