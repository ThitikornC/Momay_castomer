"""
Person detector สำหรับ relay — ฟรี + ใช้เชิงพาณิชย์ได้ (ไม่ใช้ YOLO/AGPL)

backend:
  ssd  = SSD MobileNet V2 (COCO) ผ่าน cv2.dnn   ← TensorFlow Model Zoo (Apache-2.0)
         .pbtxt bundle มากับ repo · .pb auto-download ครั้งแรก (เก็บใน models/)
  hog  = cv2.HOGDescriptor (built-in opencv, Apache-2.0) — เบา ไม่ต้องโหลดอะไร
  none = ปิด

ทั้งหมดอยู่ใน opencv-python (Apache-2.0) ไม่เพิ่ม dependency
ใช้: det = PersonDetector("ssd", conf=0.5); boxes = det.detect(frame); det.draw(frame, boxes)
"""
import os
import shutil
import tarfile
import logging
import threading
import urllib.request

import cv2
import numpy as np

import paths

logger = logging.getLogger("detector")

MODEL_DIR  = os.path.join(paths.data_dir(), "models")   # เขียนได้ (ข้าง exe/สคริปต์)
PB_PATH    = os.path.join(MODEL_DIR, "ssd_mobilenet_v2_coco.pb")
PBTXT_PATH = os.path.join(MODEL_DIR, "ssd_mobilenet_v2_coco.pbtxt")


def _ensure_pbtxt():
    """pbtxt มากับโปรแกรม (bundle) — ก๊อปออกมาที่ data_dir ถ้ายังไม่มี"""
    if os.path.exists(PBTXT_PATH):
        return True
    src = os.path.join(paths.resource_dir(), "models", "ssd_mobilenet_v2_coco.pbtxt")
    if os.path.exists(src):
        os.makedirs(MODEL_DIR, exist_ok=True)
        shutil.copyfile(src, PBTXT_PATH)
        return True
    return False

# frozen_inference_graph.pb (Apache-2.0, TensorFlow Object Detection Model Zoo)
_TAR_URL = "https://download.tensorflow.org/models/object_detection/ssd_mobilenet_v2_coco_2018_03_29.tar.gz"
_PERSON_CLASS = 1   # COCO label map: person = 1


def _ensure_ssd_model():
    """โหลด .pb ครั้งแรกถ้ายังไม่มี (extract เฉพาะ frozen_inference_graph.pb). คืน True ถ้าพร้อม"""
    if os.path.exists(PB_PATH) and os.path.getsize(PB_PATH) > 1_000_000:
        return True
    if not _ensure_pbtxt():
        logger.warning("ไม่พบ pbtxt (%s) — ข้าม SSD", PBTXT_PATH)
        return False
    os.makedirs(MODEL_DIR, exist_ok=True)
    tar_path = os.path.join(MODEL_DIR, "_ssd.tar.gz")
    try:
        logger.info("ดาวน์โหลดโมเดล SSD (ครั้งเดียว ~180MB tar)… %s", _TAR_URL)
        urllib.request.urlretrieve(_TAR_URL, tar_path)
        with tarfile.open(tar_path) as tar:
            member = next(m for m in tar.getmembers() if m.name.endswith("frozen_inference_graph.pb"))
            member.name = os.path.basename(PB_PATH)
            tar.extract(member, MODEL_DIR)
        logger.info("โมเดล SSD พร้อม → %s", PB_PATH)
        return True
    except Exception as e:
        logger.warning("โหลด/แตกโมเดล SSD ไม่สำเร็จ: %s", e)
        return False
    finally:
        try:
            if os.path.exists(tar_path):
                os.remove(tar_path)
        except Exception:
            pass


class PersonDetector:
    def __init__(self, backend="ssd", conf=0.5, input_size=300):
        self.backend = (backend or "none").lower()
        self.conf = float(conf)
        self.input_size = int(input_size)
        self.net = None
        self.hog = None
        self._lock = threading.Lock()   # cv2.dnn/HOG ไม่ reentrant — กันหลายกล้องเรียกชนกัน
        if self.backend == "ssd":
            if _ensure_ssd_model():
                try:
                    self.net = cv2.dnn.readNetFromTensorflow(PB_PATH, PBTXT_PATH)
                    logger.info("detector: SSD MobileNet V2 (cv2.dnn) พร้อม")
                except Exception as e:
                    logger.warning("โหลด SSD ไม่สำเร็จ (%s) → fallback HOG", e)
                    self.backend = "hog"
            else:
                logger.warning("ไม่มีโมเดล SSD → fallback HOG")
                self.backend = "hog"
        if self.backend == "hog":
            self.hog = cv2.HOGDescriptor()
            self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
            logger.info("detector: HOG (built-in opencv) พร้อม")

    def detect(self, frame):
        """คืน list ของ (x1, y1, x2, y2, conf) เฉพาะคน"""
        if frame is None:
            return []
        with self._lock:
            if self.backend == "ssd" and self.net is not None:
                return self._detect_ssd(frame)
            if self.backend == "hog" and self.hog is not None:
                return self._detect_hog(frame)
        return []

    def _detect_ssd(self, frame):
        h, w = frame.shape[:2]
        blob = cv2.dnn.blobFromImage(frame, size=(self.input_size, self.input_size),
                                     swapRB=True, crop=False)
        self.net.setInput(blob)
        out = self.net.forward()
        boxes = []
        for i in range(out.shape[2]):
            conf = float(out[0, 0, i, 2])
            cls  = int(out[0, 0, i, 1])
            if cls == _PERSON_CLASS and conf >= self.conf:
                x1 = int(out[0, 0, i, 3] * w); y1 = int(out[0, 0, i, 4] * h)
                x2 = int(out[0, 0, i, 5] * w); y2 = int(out[0, 0, i, 6] * h)
                boxes.append((max(0, x1), max(0, y1), min(w, x2), min(h, y2), conf))
        return boxes

    def _detect_hog(self, frame):
        rects, weights = self.hog.detectMultiScale(frame, winStride=(8, 8),
                                                   padding=(8, 8), scale=1.05)
        boxes = []
        for (x, y, w, h), wt in zip(rects, weights):
            if float(wt) >= max(0.3, self.conf):
                boxes.append((int(x), int(y), int(x + w), int(y + h), float(wt)))
        return boxes

    @staticmethod
    def draw(frame, boxes, color=(40, 220, 40)):
        """วาดกรอบ + ป้ายจำนวนคนมุมซ้ายบน คืนจำนวนคน"""
        for (x1, y1, x2, y2, _c) in boxes:
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        n = len(boxes)
        label = f"Persons: {n}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(frame, (6, 6), (6 + tw + 12, 6 + th + 12), (0, 0, 0), -1)
        cv2.putText(frame, label, (12, 6 + th + 4), cv2.FONT_HERSHEY_SIMPLEX,
                    0.6, (40, 220, 40), 2, cv2.LINE_AA)
        return n
