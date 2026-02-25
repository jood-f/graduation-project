"""
CV Model Service for Solar Panel Defect Detection
Uses YOLOv8 for detecting defects in solar panel images
"""

import os
import tempfile
import logging
from pathlib import Path
from typing import List, Dict, Optional
from urllib.request import urlretrieve

try:
    import numpy as np
except Exception:  # pragma: no cover - defensive import fallback
    np = None

try:
    import cv2
except Exception:  # pragma: no cover - defensive import fallback
    cv2 = None

logger = logging.getLogger(__name__)

# Lazy load ultralytics to avoid import errors if not installed
YOLO = None


def _load_yolo():
    global YOLO
    if YOLO is None:
        try:
            from ultralytics import YOLO as _YOLO
            YOLO = _YOLO
        except ImportError:
            logger.error("ultralytics not installed. Run: pip install ultralytics")
            raise ImportError("ultralytics package is required for CV detection")
    return YOLO


class CVModelService:
    """Service for YOLOv8 solar panel defect detection"""

    # Class mapping for your trained model
    CLASS_NAMES = {
        0: "Clean",
        1: "Dusty",
        2: "Electrical-damage",
        3: "Physical-Damage",
        4: "Snow-Covered"
    }

    def __init__(self, model_path: Optional[str] = None):
        """
        Initialize the CV model service.
        
        Args:
            model_path: Path to the trained YOLO model (.pt file).
                       Defaults to CV/runs/detect/train/weights/best.pt
        """
        self.model = None
        self.model_path = model_path
        self.model_version = "yolov8-solar-v1"
        self.unavailable_reason: Optional[str] = None
        self.detection_mode: str = "none"  # yolo | heuristic | none
        self._load_model()

    def _load_model(self):
        """Load the trained YOLOv8 model"""
        env_model_path = os.getenv("CV_MODEL_PATH")
        if env_model_path:
            self.model_path = env_model_path

        if self.model_path is None:
            # Default path - adjust based on your trained model location
            base_path = Path(__file__).parent.parent.parent.parent
            possible_paths = [
                base_path / "CV" / "YOLO_RESULTS" / "run_20260210_194054" / "runs" / "detect_train" / "weights" / "best.pt",
                base_path / "CV" / "runs" / "detect" / "train" / "weights" / "best.pt",
                base_path / "CV" / "best.pt",
                base_path / "cv" / "YOLO_RESULTS" / "run_20260210_194054" / "runs" / "detect_train" / "weights" / "best.pt",
                base_path / "cv" / "runs" / "detect" / "train" / "weights" / "best.pt",
                base_path / "cv" / "best.pt",
                base_path / "runs" / "detect" / "train" / "weights" / "best.pt",
            ]
            
            for path in possible_paths:
                if path.exists():
                    self.model_path = str(path)
                    break
        
        if self.model_path is None or not Path(self.model_path).exists():
            self.unavailable_reason = "YOLO weights file not found (set CV_MODEL_PATH or add best.pt)."
            logger.warning(self.unavailable_reason)
            self.model = None
            if cv2 is not None and np is not None:
                self.model_version = "heuristic-cv-v2"
                self.detection_mode = "heuristic"
            else:
                self.model_version = "unavailable"
                self.detection_mode = "none"
                self.unavailable_reason += " OpenCV fallback is unavailable (cv2/numpy missing)."
            return

        try:
            YOLO_cls = _load_yolo()
            self.model = YOLO_cls(self.model_path)
            logger.info(f"CV Model loaded from {self.model_path}")
            self.unavailable_reason = None
            self.model_version = "yolov8-solar-v1"
            self.detection_mode = "yolo"
        except Exception as e:
            logger.error(f"Failed to load CV model: {e}")
            self.model = None
            self.unavailable_reason = f"YOLO load failed: {e}"
            if cv2 is not None and np is not None:
                self.model_version = "heuristic-cv-v2"
                self.detection_mode = "heuristic"
            else:
                self.model_version = "unavailable"
                self.detection_mode = "none"
                self.unavailable_reason += " OpenCV fallback is unavailable (cv2/numpy missing)."

    def is_available(self) -> bool:
        """
        Check if any detection mode is available.
        YOLO is preferred; OpenCV heuristic is fallback.
        """
        return self.model is not None or self.detection_mode == "heuristic"

    def is_yolo_available(self) -> bool:
        return self.model is not None

    def _resolve_class_name(self, class_id: int, result) -> str:
        """
        Resolve class name from model/result metadata, then fall back to static mapping.
        """
        try:
            names = getattr(result, "names", None)
            if isinstance(names, dict) and class_id in names:
                return str(names[class_id])
            if isinstance(names, (list, tuple)) and 0 <= class_id < len(names):
                return str(names[class_id])
        except Exception:
            pass

        try:
            names = getattr(self.model, "names", None)
            if isinstance(names, dict) and class_id in names:
                return str(names[class_id])
            if isinstance(names, (list, tuple)) and 0 <= class_id < len(names):
                return str(names[class_id])
        except Exception:
            pass

        return self.CLASS_NAMES.get(class_id, f"class_{class_id}")

    def _heuristic_detect(self, image_path: str, confidence_threshold: float = 0.5) -> List[Dict]:
        """
        Fallback detector when YOLO is unavailable.
        Targets crack-like physical damage and visible soiling/streak anomalies.
        """
        if cv2 is None or np is None:
            raise RuntimeError("OpenCV fallback unavailable: cv2/numpy are not installed")
        image = cv2.imread(image_path)
        if image is None:
            raise RuntimeError(f"Failed to read image for heuristic detection: {image_path}")

        orig_h, orig_w = image.shape[:2]
        max_dim = max(orig_h, orig_w)
        scale = 1.0
        if max_dim > 1280:
            scale = 1280.0 / max_dim
            image = cv2.resize(image, (int(orig_w * scale), int(orig_h * scale)), interpolation=cv2.INTER_AREA)

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(gray, threshold1=50, threshold2=150)

        total_px = edges.shape[0] * edges.shape[1]
        edge_ratio = float(np.count_nonzero(edges)) / float(total_px)

        # Orientation entropy: cracked areas usually have many random edge orientations.
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=60, minLineLength=20, maxLineGap=8)
        angles = []
        if lines is not None:
            for line in lines[:, 0]:
                x1, y1, x2, y2 = line
                angle = np.degrees(np.arctan2((y2 - y1), (x2 - x1))) % 180.0
                angles.append(angle)

        entropy_norm = 0.0
        if len(angles) >= 10:
            hist, _ = np.histogram(angles, bins=18, range=(0.0, 180.0))
            p = hist.astype(float) / max(float(hist.sum()), 1.0)
            p = p[p > 0]
            entropy = float(-(p * np.log2(p)).sum())
            entropy_norm = entropy / np.log2(18.0)

        # Largest connected edge component for approximate bbox.
        num_labels, _, stats, _ = cv2.connectedComponentsWithStats((edges > 0).astype(np.uint8), 8)
        largest_area = 0
        crack_bbox = None
        for idx in range(1, num_labels):
            area = int(stats[idx, cv2.CC_STAT_AREA])
            if area > largest_area:
                largest_area = area
                x = int(stats[idx, cv2.CC_STAT_LEFT])
                y = int(stats[idx, cv2.CC_STAT_TOP])
                w = int(stats[idx, cv2.CC_STAT_WIDTH])
                h = int(stats[idx, cv2.CC_STAT_HEIGHT])
                crack_bbox = (x, y, w, h)

        largest_ratio = float(largest_area) / float(total_px)

        crack_score = (edge_ratio * 3.0) + (entropy_norm * 0.8) + min(0.2, largest_ratio * 5.0)
        is_crack_like = crack_score >= 0.55 and entropy_norm >= 0.35 and edge_ratio >= 0.05
        detections: List[Dict] = []

        if is_crack_like:
            if crack_bbox is None:
                bx, by, bw, bh = 0, 0, image.shape[1], image.shape[0]
            else:
                bx, by, bw, bh = crack_bbox

            inv_scale = 1.0 / scale
            confidence = min(0.99, max(confidence_threshold, crack_score / 1.5))
            detections.append(
                {
                    "class_id": 3,
                    "class_name": "Heuristic-Anomaly",
                    "confidence": round(float(confidence), 4),
                    "bbox": {
                        "x": float(bx * inv_scale),
                        "y": float(by * inv_scale),
                        "width": float(bw * inv_scale),
                        "height": float(bh * inv_scale),
                    },
                    "source": "heuristic",
                    "heuristic_label": "physical-damage-like",
                    "heuristic_score": round(float(crack_score), 4),
                }
            )

        # Warm-color streak detection (rust/burn/discoloration-like defects)
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        warm1 = cv2.inRange(hsv, (5, 55, 45), (28, 255, 255))
        warm2 = cv2.inRange(hsv, (170, 55, 45), (179, 255, 255))
        warm_mask = cv2.bitwise_or(warm1, warm2)
        warm_mask = cv2.medianBlur(warm_mask, 3)
        kernel = np.ones((3, 3), np.uint8)
        warm_mask = cv2.morphologyEx(warm_mask, cv2.MORPH_OPEN, kernel)

        warm_ratio = float(np.count_nonzero(warm_mask)) / float(total_px)

        labels_w, _, stats_w, _ = cv2.connectedComponentsWithStats((warm_mask > 0).astype(np.uint8), 8)
        warm_components = []
        for idx in range(1, labels_w):
            area = int(stats_w[idx, cv2.CC_STAT_AREA])
            if area < max(40, int(total_px * 0.00035)):
                continue
            x = int(stats_w[idx, cv2.CC_STAT_LEFT])
            y = int(stats_w[idx, cv2.CC_STAT_TOP])
            w = int(stats_w[idx, cv2.CC_STAT_WIDTH])
            h = int(stats_w[idx, cv2.CC_STAT_HEIGHT])
            warm_components.append((x, y, w, h, area))

        warm_largest_ratio = 0.0
        if warm_components:
            warm_largest_ratio = max(c[4] for c in warm_components) / float(total_px)

        is_warm_anomaly = warm_ratio >= 0.0022 and warm_largest_ratio >= 0.0004 and len(warm_components) > 0
        if is_warm_anomaly:
            x1 = min(c[0] for c in warm_components)
            y1 = min(c[1] for c in warm_components)
            x2 = max(c[0] + c[2] for c in warm_components)
            y2 = max(c[1] + c[3] for c in warm_components)
            inv_scale = 1.0 / scale
            warm_score = min(1.0, (warm_ratio * 35.0) + (warm_largest_ratio * 120.0))
            confidence = min(0.98, max(confidence_threshold, 0.45 + warm_score * 0.5))

            # Localized warm regions are more likely hotspot/burn areas than dust.
            # Broad warm spread is kept as soiling/dust-like.
            is_localized_hotspot = warm_largest_ratio <= 0.03 and len(warm_components) <= 6
            warm_class_name = "hotspot-like" if is_localized_hotspot else "dusty-like"
            warm_class_id = 2 if is_localized_hotspot else 1

            detections.append(
                {
                    "class_id": warm_class_id,
                    "class_name": "Heuristic-Anomaly",
                    "confidence": round(float(confidence), 4),
                    "bbox": {
                        "x": float(x1 * inv_scale),
                        "y": float(y1 * inv_scale),
                        "width": float((x2 - x1) * inv_scale),
                        "height": float((y2 - y1) * inv_scale),
                    },
                    "source": "heuristic",
                    "heuristic_label": warm_class_name,
                    "heuristic_score": round(float(warm_score), 4),
                }
            )

        logger.info(
            (
                "Heuristic CV metrics edge_ratio=%.4f entropy=%.4f largest_ratio=%.4f "
                "crack_score=%.4f crack_like=%s warm_ratio=%.4f warm_largest=%.4f warm_like=%s detections=%s"
            ),
            edge_ratio,
            entropy_norm,
            largest_ratio,
            crack_score,
            is_crack_like,
            warm_ratio,
            warm_largest_ratio,
            is_warm_anomaly,
            len(detections),
        )

        return detections

    def detect(self, image_path: str, confidence_threshold: float = 0.5) -> List[Dict]:
        """
        Run detection on an image.
        
        Args:
            image_path: Path to the image file
            confidence_threshold: Minimum confidence for detections
            
        Returns:
            List of detection results with class, confidence, and bbox
        """
        if not self.is_available():
            reason = self.unavailable_reason or "CV backend not available"
            raise RuntimeError(f"CV detector unavailable: {reason}")

        if not Path(image_path).exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        if not self.is_yolo_available():
            return self._heuristic_detect(image_path, confidence_threshold)

        try:
            results = self.model.predict(
                source=image_path,
                conf=confidence_threshold,
                imgsz=1280,
                verbose=False,
            )
            detections = []

            for result in results:
                # Handle detection results
                if hasattr(result, 'boxes') and result.boxes is not None:
                    for box in result.boxes:
                        class_id = int(box.cls[0])
                        confidence = float(box.conf[0])
                        
                        # Get bounding box coordinates (x1, y1, x2, y2)
                        xyxy = box.xyxy[0].cpu().numpy()
                        
                        detection = {
                            "class_id": class_id,
                            "class_name": self._resolve_class_name(class_id, result),
                            "confidence": round(confidence, 4),
                            "bbox": {
                                "x": float(xyxy[0]),
                                "y": float(xyxy[1]),
                                "width": float(xyxy[2] - xyxy[0]),
                                "height": float(xyxy[3] - xyxy[1])
                            }
                        }
                        detections.append(detection)

                # Handle classification results (if using classification model)
                elif hasattr(result, 'probs') and result.probs is not None:
                    probs = result.probs
                    top_class = int(probs.top1)
                    top_conf = float(probs.top1conf)
                    
                    detection = {
                        "class_id": top_class,
                        "class_name": self._resolve_class_name(top_class, result),
                        "confidence": round(top_conf, 4),
                        "bbox": None  # Classification doesn't have bounding boxes
                    }
                    detections.append(detection)

            return detections

        except Exception as e:
            logger.error(f"Detection failed: {e}")
            raise RuntimeError(f"Detection failed: {e}")

    def detect_from_url(self, image_url: str, confidence_threshold: float = 0.5) -> List[Dict]:
        """
        Download image from URL and run detection.
        
        Args:
            image_url: URL of the image to analyze
            confidence_threshold: Minimum confidence for detections
            
        Returns:
            List of detection results
        """
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
            tmp_path = tmp_file.name
        
        try:
            urlretrieve(image_url, tmp_path)
            return self.detect(tmp_path, confidence_threshold)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def detect_from_bytes(self, image_bytes: bytes, confidence_threshold: float = 0.5) -> List[Dict]:
        """
        Run detection on image bytes.
        
        Args:
            image_bytes: Raw image bytes
            confidence_threshold: Minimum confidence for detections
            
        Returns:
            List of detection results
        """
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
            tmp_file.write(image_bytes)
            tmp_path = tmp_file.name
        
        try:
            return self.detect(tmp_path, confidence_threshold)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)


# Singleton instance
_cv_service: Optional[CVModelService] = None


def get_cv_service() -> CVModelService:
    """Get or create the CV model service singleton"""
    global _cv_service
    if _cv_service is None:
        _cv_service = CVModelService()
    return _cv_service
