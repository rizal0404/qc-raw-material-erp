"""Local, opt-in grid/crop evidence export. Never called by production worker."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps
from layout import detect_layout, crop_region


def export_layout(image, template, destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    blocks, mask = detect_layout(image, template)
    overlay = image.copy()
    h, w = image.shape[:2]
    strips = []
    manifest = {}
    for block in template['blocks']:
        key = block['key']
        item = blocks[key]
        manifest[key] = {'error': item['error'], 'rows': []}
        for index, row in enumerate(item['rows']):
            strip = np.full((60, 480, 3), 255, np.uint8)
            cv2.putText(strip, f'{key} {index+1}', (4, 20), cv2.FONT_HERSHEY_SIMPLEX, .45, (0,0,0), 1)
            for ci, box in enumerate([row.dt, row.total]):
                x, y, bw, bh = box
                x1, y1, x2, y2 = round(x*w), round(y*h), round((x+bw)*w), round((y+bh)*h)
                cv2.rectangle(overlay, (x1,y1), (x2,y2), (0,130,255), 2)
                quad = row.dt_quad if ci == 0 else row.total_quad
                crop = crop_region(image, box, quad)
                if quad:
                    cv2.polylines(overlay, [(np.asarray(quad)*[w,h]).astype(np.int32)], True, (0,180,0), 2)
                if crop.size:
                    name = f'{key}-{index+1}-{ci}.png'
                    cv2.imwrite(str(destination/name), crop)
                    preview = cv2.resize(crop, (100,45))
                    strip[5:50, 230+ci*120:330+ci*120] = preview
            manifest[key]['rows'].append({'rowIndex': index+1, 'dt':row.dt, 'retase':row.total, 'gridCells':row.cells})
            strips.append(strip)
    cv2.imwrite(str(destination/'overlay.jpg'), overlay)
    cv2.imwrite(str(destination/'grid-mask.png'), mask)
    if strips:
        cv2.imwrite(str(destination/'contact-sheet.jpg'), np.vstack(strips))
    (destination/'layout.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image')
    parser.add_argument('--out-dir', required=True)
    args = parser.parse_args()
    template = json.loads(Path(__file__).with_name('template.json').read_text(encoding='utf-8'))
    with Image.open(args.image) as opened:
        source = cv2.cvtColor(np.asarray(ImageOps.exif_transpose(opened).convert('RGB')), cv2.COLOR_RGB2BGR)
    image = cv2.resize(source, (template['width'], template['height']))
    result = export_layout(image, template, args.out_dir)
    print(json.dumps({k: {'rows':len(v['rows']), 'error':v['error']} for k,v in result.items()}))


if __name__ == '__main__':
    main()
