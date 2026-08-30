"""Grid-assisted cell geometry; layout hints are search windows, not OCR boxes.

All coordinates refer to the normalized image. No handwritten values are used
to infer geometry. Unsupported/missing grid falls back explicitly, never as a
successful registration. Cells retain their physical order, including blanks.
"""
from dataclasses import dataclass
import cv2
import numpy as np


@dataclass
class GridRow:
    dt: list
    total: list
    cells: int
    dt_quad: list | None = None
    total_quad: list | None = None


def quad_box(quad):
    points = np.asarray(quad)
    low, high = points.min(axis=0), points.max(axis=0)
    return [float(low[0]), float(low[1]), float(high[0]-low[0]), float(high[1]-low[1])]


def crop_region(image, box, quad=None):
    h, w = image.shape[:2]
    if quad is not None:
        points = np.asarray(quad, np.float32) * [w, h]
        cw = max(2, round(max(np.linalg.norm(points[1]-points[0]), np.linalg.norm(points[2]-points[3]))))
        ch = max(2, round(max(np.linalg.norm(points[3]-points[0]), np.linalg.norm(points[2]-points[1]))))
        target = np.array([[0,0],[cw-1,0],[cw-1,ch-1],[0,ch-1]], np.float32)
        return cv2.warpPerspective(image, cv2.getPerspectiveTransform(points.astype(np.float32), target), (cw,ch), borderValue=(255,255,255))
    x, y, bw, bh = box
    return image[max(0,int(y*h)):min(h,int(np.ceil((y+bh)*h))), max(0,int(x*w)):min(w,int(np.ceil((x+bw)*w)))]


def column_rows(image, hint, search, cells):
    """Trace grid boundaries inside a column, accounting for local line slope."""
    h, w = image.shape[:2]
    y0, y1 = int(search[0]*h), int(search[1]*h)
    bounds = _column_at(cells, hint, (y0+y1)/2, w, h)
    if bounds is None:
        return []
    x0, x1 = max(0,int(bounds[0])), min(w,int(bounds[1]))
    gray = cv2.cvtColor(image[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    if min(gray.shape) < 8:
        return []
    lines = cv2.createLineSegmentDetector().detect(gray)[0]
    slopes = []
    if lines is not None:
        for line in lines[:, 0]:
            ax, ay, bx, by = map(float, line)
            if abs(bx-ax) > .55*(x1-x0) and abs(by-ay) < .45*abs(bx-ax):
                slopes.append(((ay+by)/2, (by-ay)/(bx-ax)))
    if len(slopes) < 3:
        return []
    a, b = _line_fit(slopes)
    yy, xx = np.indices(gray.shape, dtype=np.float32)
    local_slope = np.clip(a*yy+b, -.4, .4)
    remapped = cv2.remap(gray, xx, yy+local_slope*(xx-gray.shape[1]/2), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=255)
    binary = cv2.adaptiveThreshold(remapped,255,cv2.ADAPTIVE_THRESH_MEAN_C,cv2.THRESH_BINARY_INV,25,8)
    horizontal = cv2.morphologyEx(binary,cv2.MORPH_OPEN,np.ones((1,max(9,round(gray.shape[1]*.55))),np.uint8))
    projection = (horizontal[:, 3:-3] > 0).mean(axis=1)
    groups = []
    for y in np.flatnonzero(projection > .45):
        if groups and y-groups[-1][-1] <= 2:
            groups[-1].append(int(y))
        else:
            groups.append([int(y)])
    boundaries = [float(np.average(g,weights=projection[g])) for g in groups]
    result = []
    for top, bottom in zip(boundaries, boundaries[1:]):
        if not .009*h <= bottom-top <= .021*h:
            continue
        center = y0+(top+bottom)/2
        local_bounds = _column_at(cells,hint,center,w,h)
        if local_bounds is None:
            continue
        lx, rx = local_bounds[0]+2, local_bounds[1]-2
        quad = []
        for x,y,inset in [(lx,top,2),(rx,top,2),(rx,bottom,-2),(lx,bottom,-2)]:
            slope = float(np.clip(a*y+b,-.4,.4))
            sy = y0+y+slope*(x-(x0+x1)/2)+inset
            quad.append([max(0,min(1,x/w)),max(0,min(1,sy/h))])
        result.append(quad)
    return result


def ink_mask(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    window = max(15, round(gray.shape[1] * .026)) | 1
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                                 cv2.THRESH_BINARY_INV, window, 8)


def grid_cells(image):
    """Find enclosed cells using short directional kernels, preserving skew."""
    h, w = image.shape[:2]
    binary = ink_mask(image)
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN,
                                  np.ones((1, max(9, round(w * .015))), np.uint8))
    vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN,
                                np.ones((max(15, round(h * .016)), 1), np.uint8))
    thickness = max(2, round(w * .003))
    grid = cv2.dilate(horizontal | vertical, np.ones((thickness, thickness), np.uint8))
    contours, _ = cv2.findContours(grid, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    cells = []
    for contour in contours:
        x, y, cw, ch = cv2.boundingRect(contour)
        # Reject page regions, merged header cells, text fragments and tall totals.
        if not (.012*w <= cw <= .08*w and .008*h <= ch <= .023*h):
            continue
        if cv2.contourArea(contour) / (cw*ch) < .55:
            continue
        cells.append((x, y, cw, ch))
    return cells, grid


def _line_fit(points, fallback_slope=0.):
    if len(points) < 2 or np.ptp(np.asarray(points)[:, 0]) < 5:
        return fallback_slope, float(np.median([y-fallback_slope*x for x, y in points]))
    a, b = np.polyfit(*np.asarray(points).T, 1)
    return float(a), float(b)


def _column_at(cells, hint, row_y, width, height):
    center = (hint[0] + hint[1]/2) * width
    matches = [c for c in cells if abs(c[0]+c[2]/2-center) < .022*width
               and .55*hint[1]*width < c[2] < 1.7*hint[1]*width]
    if len(matches) < 3:
        return None
    # Nearby cells track gradual perspective/curvature without a full-paper edge.
    matches = sorted(matches, key=lambda c: abs(c[1]+c[3]/2-row_y))[:12]
    if min(abs(c[1]+c[3]/2-row_y) for c in matches) > .16*height:
        return None
    left = _line_fit([(c[1]+c[3]/2, c[0]) for c in matches])
    right = _line_fit([(c[1]+c[3]/2, c[0]+c[2]) for c in matches])
    return left[0]*row_y+left[1], right[0]*row_y+right[1]


def detect_rows(image, block, cells=None):
    """Require independently traced DT/total columns to agree on row count."""
    if cells is None:
        cells, _ = grid_cells(image)
    dt_rows = column_rows(image, block['dtX'], block.get('dtRowSearch', block['rows'][:2]), cells)
    total_rows = column_rows(image, block['totalX'], block.get('totalRowSearch', block['rows'][:2]), cells)
    if min(len(dt_rows),len(total_rows)) < 3:
        return [], 'GRID_NOT_FOUND'
    if len(dt_rows) != len(total_rows):
        return [], 'GRID_COLUMN_MISMATCH'
    if len(dt_rows) > 100:
        return [], 'GRID_TOO_MANY_ROWS'
    # A missing physical row must not silently renumber downstream evidence.
    for column in (dt_rows,total_rows):
        centers = [np.mean(q,axis=0)[1] for q in column]
        steps = np.diff(centers)
        if max(steps) > np.median(steps)*1.5 or min(steps) < np.median(steps)*.6:
            return [], 'GRID_ROWS_INCOMPLETE'
    return [GridRow(quad_box(d),quad_box(t),2,d,t) for d,t in zip(dt_rows,total_rows)], None


def detect_layout(image, template):
    cells, grid = grid_cells(image)
    blocks = {}
    for block in template['blocks']:
        rows, error = detect_rows(image, block, cells)
        blocks[block['key']] = {'rows': rows, 'error': error}
    return blocks, grid
