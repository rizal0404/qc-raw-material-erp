import unittest
from unittest.mock import patch
import cv2
import numpy as np
from layout import grid_cells, detect_rows, crop_region, quad_box


def synthetic_table(rows=10):
    image=np.full((1400,1000,3),255,np.uint8)
    xs=[80,140,165,190,215,240,265,290,315,340,390]
    ys=[180+i*24 for i in range(rows+1)]
    for x in xs:
        cv2.line(image,(x,ys[0]),(x,ys[-1]),(0,0,0),2)
    for y in ys:
        cv2.line(image,(xs[0],y),(xs[-1],y),(0,0,0),2)
    for i in range(rows):
        cv2.putText(image,str(i+1),(88,ys[i]+18),cv2.FONT_HERSHEY_SIMPLEX,.4,(0,0,0),1)
        cv2.putText(image,'2',(350,ys[i]+18),cv2.FONT_HERSHEY_SIMPLEX,.4,(0,0,0),1)
    search=[(ys[0]-8)/1400,(ys[-1]+8)/1400]
    block={'dtX':[.08,.06],'totalX':[.34,.05],'rows':[*search,17],
           'dtRowSearch':search,'totalRowSearch':search}
    return image,block


class LayoutTests(unittest.TestCase):
    def test_detects_grid_row_count_not_legacy_count(self):
        for count in (7,10,14):
            with self.subTest(rows=count):
                image,block=synthetic_table(count)
                rows,error=detect_rows(image,block)
                self.assertIsNone(error)
                self.assertEqual(len(rows),count)
                self.assertTrue(all(row.dt_quad and row.total_quad for row in rows))
                self.assertTrue(all(0<=v<=1 for row in rows for p in row.dt_quad for v in p))

    def test_blank_page_does_not_claim_registered_grid(self):
        image,block=synthetic_table()
        rows,error=detect_rows(np.full_like(image,255),block)
        self.assertTrue(error)
        self.assertEqual(rows,[])

    def test_local_slanted_grid_keeps_all_rows(self):
        for slope in (.04,-.03):
            with self.subTest(slope=slope):
                image,block=synthetic_table(10)
                warped=cv2.warpAffine(image,np.float32([[1,0,0],[slope,1,0]]),(1000,1400),borderValue=(255,255,255))
                for key in ('dtRowSearch','totalRowSearch'):
                    block[key]=[block[key][0]-.025,block[key][1]+.025]
                rows,error=detect_rows(warped,block)
                self.assertIsNone(error)
                self.assertEqual(len(rows),10)
                self.assertTrue(any(abs(r.dt_quad[0][1]-r.dt_quad[1][1])>.0005 for r in rows))

    def test_mismatched_columns_do_not_shift_dt_to_another_row(self):
        image,block=synthetic_table()
        rows,_=detect_rows(image,block)
        with patch('layout.column_rows',side_effect=[[r.dt_quad for r in rows],[r.total_quad for r in rows[:-1]]]):
            found,error=detect_rows(image,block)
        self.assertEqual(found,[])
        self.assertEqual(error,'GRID_COLUMN_MISMATCH')

    def test_a_missing_row_in_both_columns_requires_review(self):
        image,block=synthetic_table()
        rows,_=detect_rows(image,block)
        missing=rows[:3]+rows[4:]
        with patch('layout.column_rows',side_effect=[[r.dt_quad for r in missing],[r.total_quad for r in missing]]):
            found,error=detect_rows(image,block)
        self.assertEqual(found,[])
        self.assertEqual(error,'GRID_ROWS_INCOMPLETE')

    def test_perspective_crop_preserves_bounding_box_and_nonempty_content(self):
        image,block=synthetic_table()
        quad=[[.08,.12],[.14,.13],[.14,.15],[.08,.14]]
        crop=crop_region(image,quad_box(quad),quad)
        self.assertGreater(crop.shape[0],10)
        self.assertGreater(crop.shape[1],30)
        self.assertLess(float(crop.mean()),255)

    def test_crop_outside_image_is_empty_not_opencv_failure(self):
        image,_=synthetic_table()
        self.assertEqual(crop_region(image,[2,2,.1,.1]).size,0)


if __name__=='__main__':
    unittest.main()
