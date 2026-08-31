"""Conservative, template-local OCR. stdout is the versioned worker protocol.

No LLM and no sample-value fallback. Bounding boxes refer to the aligned image.
The initial template is calibrated from one supplied photograph, not benchmarked.

v0.3: Dual-engine OCR. Digit fields (dt, count) use a trained CRNN recognizer
when the model is available; otherwise Tesseract is used as fallback.  Other
field types (date, shift, text, number) always use Tesseract.
"""
import base64
import csv
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime

import cv2
import numpy as np
from PIL import Image, ImageOps
from layout import detect_layout, crop_region, GridRow
from recognizer import load_recognizer

VERSION = "0.3.0"
TEMPLATE = json.loads(Path(__file__).with_name("template.json").read_text(encoding="utf-8"))

# This is the legacy local OCR engine, not the production VLM. Keep tuning
# explicit and bounded so a benchmark is reproducible and cannot inject CLI args.
DEFAULT_CONFIG = {
    "modelConfidenceThreshold": 0.3,
    "tesseractPsm": 7,
    "tesseractScale": 3,
    "tesseractTimeoutSeconds": 15,
    "claheClipLimit": 2,
    "adaptiveThresholdBlockSize": 31,
    "adaptiveThresholdC": 12,
    "maxCount": 5000,
}


def parser_config(config=None):
    if config is None:
        config = {}
    if not isinstance(config, dict):
        raise ValueError("Parser config must be an object")
    unknown = set(config) - set(DEFAULT_CONFIG)
    if unknown:
        raise ValueError("Unknown legacy OCR config: " + ", ".join(sorted(map(str, unknown))))
    effective = {**DEFAULT_CONFIG, **config}
    ranges = {
        "modelConfidenceThreshold": (0, 1, False),
        "tesseractPsm": (3, 13, True),
        "tesseractScale": (1, 5, False),
        "tesseractTimeoutSeconds": (1, 60, False),
        "claheClipLimit": (0.1, 10, False),
        "adaptiveThresholdBlockSize": (3, 99, True),
        "adaptiveThresholdC": (-30, 30, False),
        "maxCount": (1, 5000, True),
    }
    for key, (lower, upper, integer) in ranges.items():
        value = effective[key]
        if (isinstance(value, bool) or not isinstance(value, (int, float))
                or not math.isfinite(value) or not lower <= value <= upper
                or (integer and not isinstance(value, int))):
            raise ValueError(f"Invalid legacy OCR config {key}; expected {'integer' if integer else 'number'} in [{lower}, {upper}]")
    if effective["adaptiveThresholdBlockSize"] % 2 == 0:
        raise ValueError("adaptiveThresholdBlockSize must be odd")
    return effective


def number(raw, field):
    text = re.sub(r"\s", "", raw)
    text = re.sub(r"[^0-9.,-]", "", text)
    if not text or text in ("-", ".", ","):
        return None
    if "runningTimeHours" in field or "Percent" in field:
        text = text.replace(",", ".")
    elif re.fullmatch(r"\d{1,3}([.,]\d{3})+", text):
        text = text.replace(".", "").replace(",", "")
    else:
        text = text.replace(",", ".")
    try:
        value = float(text)
        return value if 0 <= value <= 1_000_000 else None
    except ValueError:
        return None


def date_value(raw):
    match = re.search(r"(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})", raw)
    if not match:
        return None
    try:
        d, m, y = map(int, match.groups())
        return datetime(y, m, d).strftime("%Y-%m-%d")
    except ValueError:
        return None


def shift_value(raw):
    tokens = re.findall(r"\b(?:III|II|I|[123])\b", raw.upper())
    if len(set(tokens)) != 1:
        return None
    return {"I": "SHIFT_1", "1": "SHIFT_1", "II": "SHIFT_2", "2": "SHIFT_2", "III": "SHIFT_3", "3": "SHIFT_3"}.get(tokens[0])


def align(source):
    """Normalize the coordinate frame; registration is performed per grid cell."""
    h, w = source.shape[:2]
    gray = cv2.cvtColor(source, cv2.COLOR_BGR2GRAY)
    quality = {"blur": float(cv2.Laplacian(gray, cv2.CV_64F).var()), "brightness": float(gray.mean()), "contrast": float(gray.std())}
    # False means no whole-paper perspective correction was claimed.
    return cv2.resize(source, (TEMPLATE["width"], TEMPLATE["height"])), quality, False


class Extractor:
    def __init__(self, image, directory, config=None):
        self.image = image
        self.directory = Path(directory)
        self.config = parser_config(config)
        self.observations = []
        self.tesseract = os.environ.get("TESSERACT_CMD") or shutil.which("tesseract")
        if not self.tesseract:
            raise RuntimeError("Tesseract CLI tidak ditemukan. Set TESSERACT_CMD.")
        self.dt_recognizer = load_recognizer()

    def read(self, field, box, kind="text", psm=None, quad=None, geometry="TEMPLATE"):
        psm = self.config["tesseractPsm"] if psm is None else psm
        h, w = self.image.shape[:2]
        x, y, bw, bh = box
        crop = crop_region(self.image, box, quad)
        if not crop.size:
            self.observations.append({"fieldPath":field,"rawText":None,"value":None,"confidence":0,"sourceMethod":"OCR","bbox":box,"needsReview":True,"confidenceKind":"UNCALIBRATED","geometry":"TEMPLATE"})
            return None
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.createCLAHE(clipLimit=self.config["claheClipLimit"], tileGridSize=(4,4)).apply(gray)
        binary = cv2.adaptiveThreshold(gray,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,self.config["adaptiveThresholdBlockSize"],self.config["adaptiveThresholdC"])
        # Remove long grid lines, not retain unknown cells as fabricated zero.
        lines = cv2.morphologyEx(binary,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(max(20,int(bw*w*.8)),1)))
        binary = cv2.subtract(binary, lines)
        clean = cv2.copyMakeBorder(255-binary,12,12,12,12,cv2.BORDER_CONSTANT,value=255)

        # Dual-engine: trained model for digit fields, Tesseract for everything else.
        source_method = "OCR"
        confidence_kind = "UNCALIBRATED"
        if kind in ("dt", "count") and self.dt_recognizer is not None:
            model_text, model_conf = self._recognize_model(crop, clean)
            if model_text and model_conf > self.config["modelConfidenceThreshold"]:
                raw, confidence = model_text, model_conf
            else:
                raw, confidence = self._recognize_tesseract(crop, clean, kind, psm, bw, w)
        else:
            raw, confidence = self._recognize_tesseract(crop, clean, kind, psm, bw, w)

        if kind in ("number", "count"):
            value = number(raw, field)
            if kind == "count" and (value is None or value != int(value) or value > self.config["maxCount"]): value = None
            elif kind == "count": value = int(value)
        elif kind == "date": value = date_value(raw)
        elif kind == "shift": value = shift_value(raw)
        elif kind == "dt": value = re.sub(r"[^0-9]", "", raw) or None
        else: value = raw or None
        observation={"fieldPath":field,"rawText":raw or None,"value":value,"confidence":confidence,"sourceMethod":source_method,"bbox":box,"needsReview":True,"confidenceKind":confidence_kind,"geometry":geometry}
        if quad is not None: observation["polygon"]=quad
        self.observations.append(observation)
        return value

    def _recognize_model(self, crop, preprocessed):
        """Run trained CRNN digit recognizer on crop image.

        Tries the original crop first (grayscale), then the preprocessed
        (binarized + bordered) variant.  Returns the best (text, confidence).
        """
        best = ("", 0.0)
        for variant in (crop, preprocessed):
            text, conf = self.dt_recognizer.predict(variant)
            if conf > best[1]:
                best = (text, conf)
        return best

    def _recognize_tesseract(self, crop, clean, kind, psm, bw, w):
        """Multi-variant Tesseract OCR.  Returns (raw_text, confidence)."""
        crop_path = self.directory / "roi.png"
        variants=[clean]
        if kind!="text":
            plain=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY)
            variants += [cv2.copyMakeBorder(plain,12,12,12,12,cv2.BORDER_CONSTANT,value=255),cv2.copyMakeBorder(cv2.threshold(plain,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)[1],12,12,12,12,cv2.BORDER_CONSTANT,value=255)]
        candidates=[]
        for variant in variants:
            cv2.imwrite(str(crop_path),cv2.resize(variant,None,fx=self.config["tesseractScale"],fy=self.config["tesseractScale"]))
            command=[self.tesseract,str(crop_path),"stdout","--psm",str(psm),"-l","eng"]
            if kind in ("number","count","dt","date"):
                command += ["-c","tessedit_char_whitelist=0123456789.,/-"]
            result=subprocess.run(command+["tsv"],capture_output=True,text=True,encoding="utf-8",timeout=self.config["tesseractTimeoutSeconds"],check=True)
            words=[r for r in csv.DictReader(io.StringIO(result.stdout),delimiter="\t") if r.get("text", "").strip() and float(r.get("conf", -1))>=0]
            text=" ".join(r["text"] for r in words)
            score=sum(float(r["conf"]) for r in words)/max(1,len(words))/100
            if text:candidates.append((score,text))
        confidence,raw=max(candidates,default=(0,""))
        confidence=min(.74,confidence)
        if len(set(t for _,t in candidates))>1:confidence=min(.5,confidence)
        return raw, confidence



def parse(data, shifts, config=None):
    effective_config = parser_config(config)
    Image.MAX_IMAGE_PIXELS = 24_000_000
    with Image.open(io.BytesIO(data)) as opened:
        if opened.width*opened.height > 24_000_000: raise ValueError("Image too large")
        source = cv2.cvtColor(np.asarray(ImageOps.exif_transpose(opened).convert("RGB")),cv2.COLOR_RGB2BGR)
    # Keep the normalized coordinate frame stable for template search windows.
    # Per-cell grid warps handle perspective locally; a paper-edge warp followed
    # by legacy image-relative windows would apply two incompatible geometries.
    image, quality, _ = align(source)
    layout, _ = detect_layout(image, TEMPLATE)
    layout_issues=[]
    with tempfile.TemporaryDirectory(prefix="limestone-roi-") as directory:
        reader = Extractor(image,directory,effective_config)
        draft = {"schemaVersion":"1.0","reportDate":None,"shiftCode":None,"timezone":"Asia/Makassar","hours":[],"header":{},"vendors":[],"production":{},"pile":{},"notes":{},"reportRetaseTotal":None}
        for field, box in TEMPLATE["fields"].items():
            kind = "date" if field=="reportDate" else "shift" if field=="shiftCode" else "number" if field.startswith(("production.","pile.")) else "text"
            value = reader.read(field,box,kind,6 if field=="notes.raw" else None)
            if "." in field:
                group,key = field.split(".",1);draft[group][key] = value
            else: draft[field] = value
        draft["hours"] = shifts.get(draft["shiftCode"],[])
        for vi, block in enumerate(TEMPLATE["blocks"]):
            prefix = f"vendors.{vi}"
            vendor = {"blockKey":block["key"],"vendorCode":block["vendorHint"],"vendorId":None,"retaseTotal":reader.read(prefix+".retaseTotal",block["total"],"count"),"hourly":[],"vehicles":[]}
            # Positional vendor hints are never mapped to canonical IDs automatically.
            reader.observations.append({"fieldPath":prefix+".vendorCode","rawText":None,"value":block["vendorHint"],"confidence":.5,"sourceMethod":"BUSINESS_RULE","bbox":None,"needsReview":True})
            detected=layout[block["key"]]
            grid_rows=detected['rows']
            if detected['error']:
                start,end,count = block["rows"]; step=(end-start)/count
                grid_rows=[GridRow([block['dtX'][0],start+i*step,block['dtX'][1],step],[block['totalX'][0],start+i*step,block['totalX'][1],step],0) for i in range(count)]
                layout_issues.append({"code":detected['error'],"path":prefix,"severity":"WARNING","message":f"Grid {block['key']} belum dapat disejajarkan dengan aman. Crop fallback template; periksa posisi, jumlah baris, dan semua angka atau unggah foto lebih jelas."})
            for index, grid_row in enumerate(grid_rows):
                rp=f"{prefix}.vehicles.{len(vendor['vehicles'])}"
                geometry='TEMPLATE' if detected['error'] else ('GRID' if grid_row.dt_quad else 'GRID_ESTIMATED')
                dt = reader.read(rp+".dtNo",grid_row.dt,"dt",quad=grid_row.dt_quad,geometry=geometry)
                retase = reader.read(rp+".retase",grid_row.total,"count",quad=grid_row.total_quad,geometry=geometry)
                # Keep source row position even if OCR reads neither value. The
                # reviewer can remove truly blank rows, without losing evidence.
                vendor["vehicles"].append({"rowIndex":index+1,"dtNo":dt or "","retase":retase,"assignmentAaId":None,"reviewed":False})
            x,y,bw,bh = block["hourly"]
            for hi,hour in enumerate(draft["hours"]):
                value=reader.read(f"{prefix}.hourly.{hi}.retase",[x+bw*hi/8,y,bw/8,bh],"count")
                vendor["hourly"].append({"hour":hour,"retase":value})
            draft["vendors"].append(vendor)
    issues=[{"code":"TEMPLATE_REVIEW_REQUIRED","path":"","severity":"WARNING","message":"Crop DT/retase memakai grid bila terdeteksi. Header, footer, dan total masih memakai template. Skor OCR belum terkalibrasi; seluruh hasil wajib diperiksa."},*layout_issues]
    if quality["blur"]<30 or quality["brightness"]<50 or quality["contrast"]<20:
        issues.append({"code":"IMAGE_QUALITY_LOW","path":"","severity":"WARNING","message":"Kualitas foto rendah; gunakan foto lebih terang/tajam bila hasil sulit direview."})
    ok,encoded=cv2.imencode(".jpg",image,[cv2.IMWRITE_JPEG_QUALITY,85])
    if not ok: raise ValueError("Cannot encode aligned image")
    return {"result":{"draft":draft,"observations":reader.observations,"issues":issues,"parserVersion":VERSION,"templateVersion":TEMPLATE["version"]},"alignedBase64":base64.b64encode(encoded).decode("ascii"),"quality":quality,
            "diagnostics":{"engine":"LEGACY_OCR","effectiveConfig":effective_config,
                           "digitModelAvailable":reader.dt_recognizer is not None,
                           "observationCount":len(reader.observations),
                           "missingValueCount":sum(o["value"] is None for o in reader.observations)}}


if __name__=="__main__":
    request=json.load(sys.stdin)
    response=parse(base64.b64decode(request["imageBase64"],validate=True),request["shiftHours"],request.get("config"))
    print(json.dumps(response,ensure_ascii=True))
