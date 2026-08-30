"""Ground-truth evaluation, independent of OCR engine and production storage."""
from collections import defaultdict
import hashlib
import math
from pathlib import Path


def field_value(document, path):
    value = document
    try:
        for key in path.split('.'):
            value = value[int(key)] if isinstance(value, list) else value[key]
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    return value


def missing(value):
    return value is None or value == ''


def validate_labels(fields):
    paths = set()
    for field in fields:
        path = field.get('path')
        if not isinstance(path, str) or not path or path in paths:
            raise ValueError('Each ground-truth field must have a unique nonempty path')
        paths.add(path)
        if field.get('status') not in ('readable', 'blank', 'unreadable'):
            raise ValueError(f'Invalid label status: {path}')
        if not isinstance(field.get('kind'), str) or not field['kind']:
            raise ValueError(f'Missing field kind: {path}')
        expected = field.get('expected')
        if field['status'] == 'readable' and (missing(expected) or isinstance(expected, (bool, dict, list))):
            raise ValueError(f'Readable labels require a string or number: {path}')
        if isinstance(expected, float) and not math.isfinite(expected):
            raise ValueError(f'Nonfinite expected value: {path}')
        if field['status'] != 'readable' and expected is not None:
            raise ValueError(f'Blank/unreadable labels must have expected=null: {path}')


def evaluate(draft, fields):
    """Missing output is an error on readable labels; blank != numeric zero."""
    validate_labels(fields)
    counts = defaultdict(lambda: dict(readable=0, correct=0, predicted=0,
                                      blank=0, unreadable=0, correctAbstentions=0, hallucinations=0))
    errors = []
    for field in fields:
        actual = field_value(draft, field['path'])
        expected, status = field.get('expected'), field['status']
        group = counts[field['kind']]
        if status == 'readable':
            group['readable'] += 1
            group['predicted'] += int(not missing(actual))
            correct = actual == expected and not isinstance(actual, bool)
            group['correct'] += int(correct)
        else:
            group[status] += 1
            correct = missing(actual)
            group['correctAbstentions'] += int(correct)
            group['hallucinations'] += int(not correct)
        if not correct:
            errors.append({'path':field['path'],'kind':field['kind'],'status':status,'expected':expected,'actual':actual})
    return {'metrics':dict(counts),'errors':errors,'labeledFields':len(fields)}


def summarize(results):
    totals = defaultdict(lambda: defaultdict(int))
    for result in results:
        for kind, values in result['metrics'].items():
            for key, value in values.items():
                totals[kind][key] += value
    return {kind:{**dict(c), 'exactMatch':c['correct']/c['readable'] if c['readable'] else None,
                  'coverage':c['predicted']/c['readable'] if c['readable'] else None}
            for kind,c in totals.items()}


def validate_manifest(manifest, base_dir):
    if manifest.get('schemaVersion') != '1.0' or not manifest.get('samples'):
        raise ValueError('Manifest requires schemaVersion 1.0 and nonempty samples')
    identifiers, documents, images = set(), {}, {}
    for sample in manifest['samples']:
        if not sample.get('id') or sample['id'] in identifiers:
            raise ValueError('Sample IDs must be unique')
        identifiers.add(sample['id'])
        split, document = sample.get('split'), sample.get('documentId')
        if split not in ('train','validation','test') or not document:
            raise ValueError('Each sample requires a documentId and train/validation/test split')
        if sample.get('labelStatus') not in ('provisional','verified'):
            raise ValueError('Each sample requires provisional or verified labelStatus')
        validate_labels(sample.get('fields', []))
        if not sample.get('fields'):
            raise ValueError('Samples require nonempty fields')
        digest = hashlib.sha256((Path(base_dir)/sample['image']).read_bytes()).hexdigest()
        if sample.get('sha256') and sample['sha256'] != digest:
            raise ValueError(f'Image checksum changed: {sample["id"]}')
        for key, mapping in ((document, documents),(digest, images)):
            if key in mapping and mapping[key] != split:
                raise ValueError('Data leakage: same document/image appears in multiple splits')
            mapping[key] = split
