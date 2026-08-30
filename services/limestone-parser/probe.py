"""Developer-only ROI OCR diagnostic; no inferred ground truth."""
import json,subprocess,sys,tempfile
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageOps
from parser import TEMPLATE
source=cv2.cvtColor(np.asarray(ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGB')),cv2.COLOR_RGB2BGR)
h,w=source.shape[:2]
with tempfile.TemporaryDirectory() as d:
    for field in ['reportDate','shiftCode','production.pileTon','production.runningTimeHours','production.capacityTph','pile.baratPercent']:
        x,y,bw,bh=TEMPLATE['fields'][field];roi=source[int(y*h):int((y+bh)*h),int(x*w):int((x+bw)*w)]
        gray=cv2.cvtColor(cv2.resize(roi,None,fx=4,fy=4),cv2.COLOR_BGR2GRAY)
        for variant,image in [('gray',gray),('otsu',cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)[1])]:
            filename=Path(d)/'crop.png';cv2.imwrite(str(filename),cv2.copyMakeBorder(image,30,30,30,30,cv2.BORDER_CONSTANT,value=255))
            for psm in [6,7,8,13]:
                r=subprocess.run(['tesseract',str(filename),'stdout','--psm',str(psm),'-c','tessedit_char_whitelist=0123456789.,/I'],capture_output=True,text=True)
                print(field,variant,psm,repr(r.stdout.strip()))
