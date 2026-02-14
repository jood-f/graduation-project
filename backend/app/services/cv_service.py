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
        self._load_model()

    def _load_model(self):
        """Load the trained YOLOv8 model"""
        if self.model_path is None:
            # Default path - adjust based on your trained model location
            base_path = Path(__file__).parent.parent.parent.parent
            possible_paths = [
                base_path / "CV" / "YOLO_RESULTS" / "run_20260210_194054" / "runs" / "detect_train" / "weights" / "best.pt",
                base_path / "CV" / "runs" / "detect" / "train" / "weights" / "best.pt",
                base_path / "CV" / "best.pt",
                base_path / "runs" / "detect" / "train" / "weights" / "best.pt",
            ]
            
            for path in possible_paths:
                if path.exists():
                    self.model_path = str(path)
                    break
        
        if self.model_path is None or not Path(self.model_path).exists():
            logger.warning(f"Model not found. Detection will not be available.")
            return

        try:
            YOLO_cls = _load_yolo()
            self.model = YOLO_cls(self.model_path)
            logger.info(f"CV Model loaded from {self.model_path}")
        except Exception as e:
            logger.error(f"Failed to load CV model: {e}")
            self.model = None

    def is_available(self) -> bool:
        """Check if the model is loaded and ready"""
        return self.model is not None

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
            raise RuntimeError("CV model not loaded. Cannot perform detection.")

        if not Path(image_path).exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        try:
            results = self.model(image_path, conf=confidence_threshold)
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
                            "class_name": self.CLASS_NAMES.get(class_id, f"class_{class_id}"),
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
                        "class_name": self.CLASS_NAMES.get(top_class, f"class_{top_class}"),
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
