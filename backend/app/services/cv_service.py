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

# Lazy-load Ultralytics so the API can still boot and report a clear error if the package is missing.
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

    # Keep runtime labels aligned with the order used during training.
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
        self.model_task = "unknown"
        self.unavailable_reason: Optional[str] = None
        self.model_search_paths: List[str] = []
        self.allow_heuristic_fallback = str(
            os.getenv("CV_ALLOW_HEURISTIC_FALLBACK", "false")
        ).strip().lower() in {"1", "true", "yes", "on"}
        self.detection_mode: str = "none"
        self._load_model()

    def _latest_weight_candidates(self, search_roots: List[Path], patterns: List[str]) -> List[Path]:
        matches: List[Path] = []
        for root in search_roots:
            if not root.exists():
                continue
            for pattern in patterns:
                matches.extend(root.glob(pattern))

        unique_matches: List[Path] = []
        for path in sorted(matches, key=lambda candidate: candidate.stat().st_mtime, reverse=True):
            if path.exists() and path not in unique_matches:
                unique_matches.append(path)
        return unique_matches

    def _candidate_model_paths(self) -> List[Path]:
        if self.model_path is not None:
            return [Path(self.model_path)]

        candidates: List[Path] = []
        env_classification_model_path = os.getenv("CV_CLASSIFICATION_MODEL_PATH")
        if env_classification_model_path:
            candidates.append(Path(env_classification_model_path))

        env_model_path = os.getenv("CV_MODEL_PATH")
        if env_model_path:
            candidates.append(Path(env_model_path))

        base_path = Path(__file__).resolve().parents[3]
        run_roots = [
            base_path / "CV" / "YOLO_RESULTS",
            Path.cwd() / "CV" / "YOLO_RESULTS",
        ]
        # Prefer the newest classifier first, then fall back to the older detector layout.
        candidates.extend(
            self._latest_weight_candidates(
                run_roots,
                [
                    "run_*/runs/classify_train/weights/best.pt",
                    "run_*/classify_train/weights/best.pt",
                ],
            )
        )
        candidates.extend(
            [
                base_path / "CV" / "best-cls.pt",
                base_path / "backend" / "CV" / "best-cls.pt",
                base_path / "backend" / "models" / "cv" / "best-cls.pt",
                Path.cwd() / "CV" / "best-cls.pt",
                Path.cwd() / "backend" / "models" / "cv" / "best-cls.pt",
                base_path / "CV" / "YOLO_RESULTS" / "run_20260210_194054" / "runs" / "detect_train" / "weights" / "best.pt",
                base_path / "CV" / "runs" / "detect" / "train" / "weights" / "best.pt",
                base_path / "CV" / "best.pt",
                base_path / "backend" / "CV" / "best.pt",
                base_path / "backend" / "models" / "cv" / "best.pt",
                Path.cwd() / "CV" / "best.pt",
                Path.cwd() / "backend" / "models" / "cv" / "best.pt",
                Path.cwd() / "runs" / "detect" / "train" / "weights" / "best.pt",
            ]
        )
        candidates.extend(
            self._latest_weight_candidates(
                run_roots,
                [
                    "run_*/runs/detect_train/weights/best.pt",
                    "run_*/runs/solar_detection/weights/best.pt",
                ],
            )
        )

        unique: List[Path] = []
        for path in candidates:
            if path not in unique:
                unique.append(path)
        return unique

    def _infer_model_task(self) -> str:
        task_candidates = [
            getattr(self.model, "task", None),
            getattr(getattr(self.model, "model", None), "task", None),
        ]
        for task in task_candidates:
            normalized = str(task or "").strip().lower()
            if normalized in {"classify", "classification", "cls"}:
                return "classification"
            if normalized in {"detect", "detection"}:
                return "detection"

        # Ultralytics task metadata is not always populated the same way across versions,
        # so the filename is our last reliable hint.
        normalized_path = str(self.model_path or "").strip().lower()
        if any(token in normalized_path for token in ("best-cls.pt", "classify_train", "-cls")):
            return "classification"
        return "detection"

    def _load_model(self):
        """Load the trained YOLOv8 model"""
        candidates = self._candidate_model_paths()
        self.model_search_paths = [str(path) for path in candidates]
        resolved_model_path = next((path for path in candidates if path.exists()), None)
        if resolved_model_path is not None:
            self.model_path = str(resolved_model_path)

        if self.model_path is None or not Path(self.model_path).exists():
            self.unavailable_reason = (
                "YOLO weights file not found (set CV_MODEL_PATH or deploy best.pt). "
                f"Searched: {', '.join(self.model_search_paths)}"
            )
            logger.warning(self.unavailable_reason)
            self.model = None
            if self.allow_heuristic_fallback and cv2 is not None and np is not None:
                self.model_version = "heuristic-cv-v2"
                self.detection_mode = "heuristic"
            else:
                self.model_version = "unavailable"
                self.detection_mode = "none"
                if not self.allow_heuristic_fallback:
                    self.unavailable_reason += " Heuristic fallback is disabled."
                else:
                    self.unavailable_reason += " OpenCV fallback is unavailable (cv2/numpy missing)."
            return

        try:
            YOLO_cls = _load_yolo()
            self.model = YOLO_cls(self.model_path)
            logger.info(f"CV Model loaded from {self.model_path}")
            self.unavailable_reason = None
            self.model_task = self._infer_model_task()
            if self.model_task == "classification":
                self.model_version = "yolov8-solar-cls-v1"
                self.detection_mode = "classification"
            else:
                self.model_version = "yolov8-solar-v1"
                self.detection_mode = "yolo"
        except Exception as e:
            logger.error(f"Failed to load CV model: {e}")
            self.model = None
            self.model_task = "unknown"
            self.unavailable_reason = f"YOLO load failed: {e}"
            if self.allow_heuristic_fallback and cv2 is not None and np is not None:
                self.model_version = "heuristic-cv-v2"
                self.detection_mode = "heuristic"
            else:
                self.model_version = "unavailable"
                self.detection_mode = "none"
                if not self.allow_heuristic_fallback:
                    self.unavailable_reason += " Heuristic fallback is disabled."
                else:
                    self.unavailable_reason += " OpenCV fallback is unavailable (cv2/numpy missing)."

    def is_available(self) -> bool:
        """
        Check if any detection mode is available.
        YOLO is preferred; OpenCV heuristic is fallback.
        """
        return self.model is not None or (
            self.allow_heuristic_fallback and self.detection_mode == "heuristic"
        )

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

    def _load_analysis_image(self, image_path: str):
        if cv2 is None or np is None:
            raise RuntimeError("OpenCV analysis unavailable: cv2/numpy are not installed")

        image = cv2.imread(image_path)
        if image is None:
            raise RuntimeError(f"Failed to read image for CV analysis: {image_path}")

        orig_h, orig_w = image.shape[:2]
        max_dim = max(orig_h, orig_w)
        scale = 1.0
        if max_dim > 1280:
            scale = 1280.0 / max_dim
            image = cv2.resize(
                image,
                (int(orig_w * scale), int(orig_h * scale)),
                interpolation=cv2.INTER_AREA,
            )

        return image, scale, orig_h, orig_w

    def _compute_crack_metrics(self, image) -> Dict[str, float | bool | tuple[int, int, int, int] | None]:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(gray, threshold1=50, threshold2=150)

        total_px = edges.shape[0] * edges.shape[1]
        edge_ratio = float(np.count_nonzero(edges)) / float(total_px)

        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=60, minLineLength=20, maxLineGap=8)
        angles = []
        if lines is not None:
            for line in lines[:, 0]:
                x1, y1, x2, y2 = line
                angle = np.degrees(np.arctan2((y2 - y1), (x2 - x1))) % 180.0
                angles.append(angle)

        entropy_norm = 0.0
        dominant_share = 0.0
        mean_line_length = 0.0
        max_line_length = 0.0
        if len(angles) >= 10:
            hist, _ = np.histogram(angles, bins=18, range=(0.0, 180.0))
            p = hist.astype(float) / max(float(hist.sum()), 1.0)
            p = p[p > 0]
            entropy = float(-(p * np.log2(p)).sum())
            entropy_norm = entropy / np.log2(18.0)
            dominant_share = float(hist.max()) / float(hist.sum())

        if lines is not None:
            lengths = []
            for line in lines[:, 0]:
                x1, y1, x2, y2 = line
                lengths.append(float(np.hypot(x2 - x1, y2 - y1)))
            if lengths:
                mean_line_length = float(np.mean(lengths))
                max_line_length = float(np.max(lengths))

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

        return {
            "edge_ratio": edge_ratio,
            "entropy_norm": entropy_norm,
            "largest_ratio": largest_ratio,
            "crack_score": crack_score,
            "crack_bbox": crack_bbox,
            "is_crack_like": is_crack_like,
            "dominant_share": dominant_share,
            "mean_line_length": mean_line_length,
            "max_line_length": max_line_length,
        }

    def _crop_analysis_image(self, image, bbox: Optional[Dict[str, float]], scale: float):
        if image is None or bbox is None:
            return None

        image_h, image_w = image.shape[:2]
        x = max(0, int(round(float(bbox.get("x") or 0.0) * scale)))
        y = max(0, int(round(float(bbox.get("y") or 0.0) * scale)))
        width = max(0, int(round(float(bbox.get("width") or 0.0) * scale)))
        height = max(0, int(round(float(bbox.get("height") or 0.0) * scale)))
        x2 = min(image_w, x + width)
        y2 = min(image_h, y + height)

        if x >= x2 or y >= y2:
            return None

        return image[y:y2, x:x2]

    def _bbox_coverage(
        self,
        bbox: Optional[Dict[str, float]],
        *,
        image_width: int,
        image_height: int,
    ) -> Optional[float]:
        if not bbox:
            return None

        width = max(0.0, float(bbox.get("width") or 0.0))
        height = max(0.0, float(bbox.get("height") or 0.0))
        if image_width <= 0 or image_height <= 0:
            return None

        bounded_width = min(width, float(image_width))
        bounded_height = min(height, float(image_height))
        return (bounded_width * bounded_height) / float(image_width * image_height)

    def _should_keep_model_detection(
        self,
        detection: Dict,
        *,
        image_width: int,
        image_height: int,
        crack_metrics: Dict[str, float | bool | tuple[int, int, int, int] | None] | None,
        confidence_threshold: float,
    ) -> bool:
        normalized_class = str(detection.get("class_name") or "").strip().lower()
        if normalized_class != "physical-damage":
            return True

        bbox_coverage = self._bbox_coverage(
            detection.get("bbox"),
            image_width=image_width,
            image_height=image_height,
        )
        if bbox_coverage is None:
            return True

        confidence = float(detection.get("confidence") or 0.0)
        minimum_supported_confidence = max(0.78, confidence_threshold + 0.18)
        if confidence >= minimum_supported_confidence:
            return True

        dominant_share = float(crack_metrics.get("dominant_share", 0.0)) if crack_metrics else 0.0
        entropy_norm = float(crack_metrics.get("entropy_norm", 0.0)) if crack_metrics else 0.0
        max_line_length = float(crack_metrics.get("max_line_length", 0.0)) if crack_metrics else 0.0
        bbox = detection.get("bbox") or {}
        bbox_width = max(1.0, float(bbox.get("width") or 0.0))
        bbox_height = max(1.0, float(bbox.get("height") or 0.0))
        localized_panel_line_pattern = (
            confidence < max(0.72, confidence_threshold + 0.15)
            and dominant_share >= 0.65
            and entropy_norm <= 0.42
            and max_line_length >= max(bbox_width, bbox_height) * 0.9
        )
        if localized_panel_line_pattern:
            logger.info(
                (
                    "Suppressing YOLO panel-line-like physical-damage detection "
                    "confidence=%.4f coverage=%.4f dominant_share=%.4f entropy=%.4f max_line_length=%.4f"
                ),
                confidence,
                bbox_coverage,
                dominant_share,
                entropy_norm,
                max_line_length,
            )
            return False

        smallest_dimension = min(image_width, image_height)
        thumbnail_confidence_floor = max(0.9, confidence_threshold + 0.4)
        if bbox_coverage >= 0.85 and smallest_dimension <= 256 and confidence < thumbnail_confidence_floor:
            logger.info(
                (
                    "Suppressing YOLO thumbnail-sized physical-damage detection "
                    "confidence=%.4f coverage=%.4f min_dimension=%s floor=%.4f"
                ),
                confidence,
                bbox_coverage,
                smallest_dimension,
                thumbnail_confidence_floor,
            )
            return False

        if bbox_coverage < 0.55:
            return True

        if crack_metrics and bool(crack_metrics.get("is_crack_like")):
            return True

        logger.info(
            (
                "Suppressing YOLO physical-damage detection without crack evidence "
                "confidence=%.4f coverage=%.4f crack_score=%.4f edge_ratio=%.4f entropy=%.4f"
            ),
            confidence,
            bbox_coverage,
            float(crack_metrics.get("crack_score", 0.0)) if crack_metrics else 0.0,
            float(crack_metrics.get("edge_ratio", 0.0)) if crack_metrics else 0.0,
            float(crack_metrics.get("entropy_norm", 0.0)) if crack_metrics else 0.0,
        )
        return False

    def _heuristic_detect(self, image_path: str, confidence_threshold: float = 0.5) -> List[Dict]:
        """
        Fallback detector when YOLO is unavailable.
        Targets crack-like physical damage and visible soiling/streak anomalies.
        """
        image, scale, _, _ = self._load_analysis_image(image_path)
        crack_metrics = self._compute_crack_metrics(image)
        total_px = image.shape[0] * image.shape[1]
        edge_ratio = float(crack_metrics["edge_ratio"])
        entropy_norm = float(crack_metrics["entropy_norm"])
        largest_ratio = float(crack_metrics["largest_ratio"])
        crack_score = float(crack_metrics["crack_score"])
        crack_bbox = crack_metrics["crack_bbox"]
        is_crack_like = bool(crack_metrics["is_crack_like"])
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
                    "class_name": self.CLASS_NAMES.get(3, "Physical-Damage"),
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
                    "class_name": self.CLASS_NAMES.get(
                        warm_class_id,
                        "Electrical-damage" if is_localized_hotspot else "Dusty",
                    ),
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
            if self.allow_heuristic_fallback:
                return self._heuristic_detect(image_path, confidence_threshold)
            raise RuntimeError("YOLO detector unavailable and heuristic fallback is disabled")

        try:
            results = self.model.predict(
                source=image_path,
                conf=confidence_threshold,
                imgsz=1280,
                verbose=False,
            )
            detections = []

            for result in results:
                if hasattr(result, 'boxes') and result.boxes is not None:
                    for box in result.boxes:
                        class_id = int(box.cls[0])
                        confidence = float(box.conf[0])

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

                elif hasattr(result, 'probs') and result.probs is not None:
                    probs = result.probs
                    top_class = int(probs.top1)
                    top_conf = float(probs.top1conf)

                    # Keep classifier responses in the same payload shape the detector already returns.
                    detection = {
                        "class_id": top_class,
                        "class_name": self._resolve_class_name(top_class, result),
                        "confidence": round(top_conf, 4),
                        "bbox": None
                    }
                    detections.append(detection)

            if detections and cv2 is not None and np is not None:
                if any(
                    str(detection.get("class_name") or "").strip().lower() == "physical-damage"
                    and detection.get("bbox") is not None
                    for detection in detections
                ):
                    try:
                        analysis_image, scale, orig_h, orig_w = self._load_analysis_image(image_path)
                        filtered_detections = []
                        for detection in detections:
                            crop_image = self._crop_analysis_image(
                                analysis_image,
                                detection.get("bbox"),
                                scale,
                            )
                            crack_metrics = self._compute_crack_metrics(
                                crop_image if crop_image is not None else analysis_image
                            )
                            if self._should_keep_model_detection(
                                detection,
                                image_width=orig_w,
                                image_height=orig_h,
                                crack_metrics=crack_metrics,
                                confidence_threshold=confidence_threshold,
                            ):
                                filtered_detections.append(detection)
                        detections = filtered_detections
                    except Exception as e:
                        logger.warning("Failed to run YOLO false-positive suppression: %s", e)

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
