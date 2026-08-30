import unittest
from unittest.mock import patch
import cv2
import numpy as np
from parser import align, date_value, number, shift_value

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

if __name__=="__main__": unittest.main()
