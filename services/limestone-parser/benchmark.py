"""Offline evaluation. Explicit labels distinguish accuracy from mere coverage."""
import argparse
import json
from pathlib import Path
import tempfile
import time
import cv2
import numpy as np
from PIL import Image, ImageOps
from parser import parse, parser_config, Extractor, TEMPLATE, VERSION
from evaluation import evaluate, summarize, validate_manifest, validate_labels
from diagnostics import export_layout

SHIFTS={'SHIFT_1':list(range(7,15)),'SHIFT_2':list(range(15,23))}


def normalized_image(path):
    with Image.open(path) as opened:
        source=cv2.cvtColor(np.asarray(ImageOps.exif_transpose(opened).convert('RGB')),cv2.COLOR_RGB2BGR)
    return cv2.resize(source,(TEMPLATE['width'],TEMPLATE['height']))


def set_field(document, path, value):
    keys=path.split('.')
    node=document
    for i,key in enumerate(keys):
        if isinstance(node,list):
            key=int(key)
            while len(node)<=key: node.append(None)
        if i==len(keys)-1:
            node[key]=value
        else:
            if (node[key] if isinstance(node,list) else node.get(key)) is None:
                node[key]=[] if keys[i+1].isdigit() else {}
            node=node[key]


def oracle_prediction(image, fields, config=None):
    """Read only human-annotated normalized boxes, isolating recognition error."""
    result={}
    with tempfile.TemporaryDirectory(prefix='limestone-oracle-') as tmp:
        reader=Extractor(image,tmp,config)
        for label in fields:
            box=label.get('bbox')
            if not isinstance(box,list) or len(box)!=4 or any(not isinstance(v,(int,float)) or not 0<=v<=1 for v in box) or min(box[2:])<=0 or box[0]+box[2]>1 or box[1]+box[3]>1:
                raise ValueError('Oracle mode requires a valid annotated normalized bbox for every field')
            kind=label.get('ocrKind')
            if kind not in ('dt','count','date','shift','number','text'):
                raise ValueError('Oracle mode requires explicit ocrKind for each field')
            set_field(result,label['path'],reader.read(label['path'],box,kind))
    return result


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('image',nargs='?')
    cli.add_argument('output',nargs='?',help='Legacy: save complete parser output (contains image bytes)')
    cli.add_argument('--labels',help='Single-photo labels JSON: labelStatus + fields')
    cli.add_argument('--result',help='Evaluate saved parser JSON without running OCR')
    cli.add_argument('--manifest',help='Dataset manifest; all splits checked for leakage before selection')
    cli.add_argument('--split',choices=['train','validation','test'],default='test')
    cli.add_argument('--mode',choices=['end-to-end','oracle'],default='end-to-end')
    cli.add_argument('--report',help='Write metrics/errors JSON (no image bytes)')
    cli.add_argument('--debug-dir',help='Explicit local opt-in export of crop/overlay evidence')
    cli.add_argument('--config',help='JSON object with legacy OCR tuning; effective config is recorded in metrics')
    args=cli.parse_args()
    if args.result and args.config: cli.error('--config cannot tune a cached --result')
    try:
        config=parser_config(json.loads(Path(args.config).read_text(encoding='utf-8')) if args.config else None)
    except (OSError, ValueError) as error:
        cli.error(str(error))
    if args.manifest:
        if args.image or args.labels or args.result or args.output: cli.error('--manifest cannot be combined with single-photo arguments')
        manifest_path=Path(args.manifest)
        manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
        validate_manifest(manifest,manifest_path.parent)
        samples=[{**s,'image':str(manifest_path.parent/s['image'])} for s in manifest['samples'] if s['split']==args.split]
        if not samples: cli.error('Selected split has no samples')
    else:
        if not args.image: cli.error('Provide image or --manifest')
        labels=json.loads(Path(args.labels).read_text(encoding='utf-8')) if args.labels else None
        if labels and labels.get('labelStatus') not in ('provisional','verified'): cli.error('Labels require provisional/verified labelStatus')
        if args.mode=='oracle' and (not labels or args.result): cli.error('Oracle requires --labels and cannot use --result')
        samples=[{'id':'single-photo','documentId':'single-photo','image':args.image,**(labels or {})}]
    runs=[]
    for index,sample in enumerate(samples):
        start=time.perf_counter()
        fields=sample.get('fields')
        if fields is not None: validate_labels(fields)
        if args.mode=='oracle':
            draft=oracle_prediction(normalized_image(sample['image']),fields,config)
            result={'result':{'draft':draft,'parserVersion':VERSION},'diagnostics':{'engine':'LEGACY_OCR','effectiveConfig':config}}
        else:
            result=json.loads(Path(args.result).read_text(encoding='utf-8')) if args.result else parse(Path(sample['image']).read_bytes(),SHIFTS,config)
            draft=result['result']['draft']
        run={'sampleId':sample['id'],'documentId':sample['documentId'],'labelStatus':sample.get('labelStatus','unlabeled'),
             'parserVersion':result['result']['parserVersion'],'mode':args.mode,'durationSeconds':round(time.perf_counter()-start,3),
             'usedCachedResult':bool(args.result),'effectiveConfig':result.get('diagnostics',{}).get('effectiveConfig')}
        if fields:
            run.update(evaluate(draft,fields))
        else:
            run['warning']='No ground truth: coverage only, NOT accuracy.'
        run['coverageOnly']=[{'vendor':v['vendorCode'],'rows':len(v['vehicles']),
                             'filledRows':sum(r['retase'] is not None and bool(r['dtNo']) for r in v['vehicles'])} for v in draft.get('vendors',[]) if v and 'vehicles' in v and 'vendorCode' in v]
        runs.append(run)
        if args.debug_dir: export_layout(normalized_image(sample['image']),TEMPLATE,Path(args.debug_dir)/str(index))
        if args.output: Path(args.output).write_text(json.dumps(result,indent=2),encoding='utf-8')
    report={'schemaVersion':'1.0','mode':args.mode,'samples':runs,'metrics':summarize([r for r in runs if 'metrics' in r]),
            'notice':'Pilot metrics are not production certification. Provisional labels require independent human verification; cached-result duration is not OCR latency.'}
    if args.report: Path(args.report).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
