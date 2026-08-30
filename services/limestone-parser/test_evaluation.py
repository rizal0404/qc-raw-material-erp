import json
from pathlib import Path
import tempfile
import unittest
from evaluation import evaluate, summarize, validate_manifest


class EvaluationTests(unittest.TestCase):
    def test_wrong_and_missing_predictions_are_not_accuracy(self):
        fields=[{'path':'dt','kind':'dt','status':'readable','expected':'07'},
                {'path':'retase','kind':'retase','status':'readable','expected':3},
                {'path':'missing','kind':'retase','status':'readable','expected':2}]
        report=evaluate({'dt':'44','retase':3},fields)
        metrics=summarize([report])
        self.assertEqual(metrics['dt']['exactMatch'],0)
        self.assertEqual(metrics['dt']['coverage'],1)
        self.assertEqual(metrics['retase']['exactMatch'],.5)
        self.assertEqual(len(report['errors']),2)

    def test_blank_zero_and_unreadable_are_different(self):
        fields=[{'path':'blank','kind':'retase','status':'blank','expected':None},
                {'path':'zero','kind':'retase','status':'readable','expected':0},
                {'path':'faint','kind':'retase','status':'unreadable','expected':None}]
        metrics=evaluate({'blank':0,'zero':0,'faint':None},fields)['metrics']['retase']
        self.assertEqual(metrics['correct'],1)
        self.assertEqual(metrics['hallucinations'],1)
        self.assertEqual(metrics['correctAbstentions'],1)

    def test_duplicate_dt_rows_are_evaluated_separately(self):
        report=evaluate({'vehicles':[{'dt':'24'},{'dt':'24'}]},[
            {'path':f'vehicles.{i}.dt','kind':'dt','status':'readable','expected':'24'} for i in range(2)])
        self.assertEqual(report['metrics']['dt']['correct'],2)

    def test_labels_cannot_use_null_as_readable_ground_truth(self):
        with self.assertRaises(ValueError):
            evaluate({},[{'path':'dt','kind':'dt','status':'readable','expected':None}])

    def test_same_document_and_duplicate_image_cannot_leak_between_splits(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'a.jpg').write_bytes(b'image-a')
            (root/'b.jpg').write_bytes(b'image-b')
            fields=[{'path':'dt','kind':'dt','status':'readable','expected':'07'}]
            samples=[{'id':'a','documentId':'doc','split':'train','image':'a.jpg','labelStatus':'verified','fields':fields},
                     {'id':'b','documentId':'doc','split':'test','image':'b.jpg','labelStatus':'verified','fields':fields}]
            with self.assertRaisesRegex(ValueError,'leakage'):
                validate_manifest({'schemaVersion':'1.0','samples':samples},root)
            samples[1]['documentId']='other'
            samples[1]['image']='a.jpg'
            with self.assertRaisesRegex(ValueError,'leakage'):
                validate_manifest({'schemaVersion':'1.0','samples':samples},root)
            samples[1]['image']='b.jpg'
            validate_manifest({'schemaVersion':'1.0','samples':samples},root)


if __name__=='__main__':
    unittest.main()
