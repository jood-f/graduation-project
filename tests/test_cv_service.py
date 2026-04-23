import cv2
import numpy as np

import app.services.cv_service as cv_service_module
from app.services.cv_service import CVModelService


class FakeTensor:
    def __init__(self, values):
        self.values = np.array(values, dtype=float)

    def __getitem__(self, index):
        item = self.values[index]
        if np.isscalar(item):
            return item
        return FakeTensor(item)

    def cpu(self):
        return self

    def numpy(self):
        return self.values


class FakeBox:
    def __init__(self, *, class_id: int, confidence: float, xyxy):
        self.cls = FakeTensor([class_id])
        self.conf = FakeTensor([confidence])
        self.xyxy = [FakeTensor(xyxy)]


class FakeResult:
    def __init__(self, boxes, names=None):
        self.boxes = boxes
        self.probs = None
        self.names = names or {}


class FakeYoloModel:
    def __init__(self, result, names=None):
        self._result = result
        self.names = names or {}

    def predict(self, **_kwargs):
        return [self._result]


class FakeProbs:
    def __init__(self, *, top1: int, top1conf: float):
        self.top1 = top1
        self.top1conf = top1conf


class FakeClassificationResult:
    def __init__(self, *, top1: int, top1conf: float, names=None):
        self.boxes = None
        self.probs = FakeProbs(top1=top1, top1conf=top1conf)
        self.names = names or {}


class FakeClassificationModel(FakeYoloModel):
    def __init__(self, result, names=None):
        super().__init__(result, names=names)
        self.task = "classify"


def test_cv_service_uses_heuristic_fallback_with_domain_class_names(tmp_path, monkeypatch):
    monkeypatch.setenv("CV_ALLOW_HEURISTIC_FALLBACK", "true")

    image = np.zeros((256, 256, 3), dtype=np.uint8)
    cv2.rectangle(image, (100, 100), (140, 140), (0, 140, 255), -1)
    image_path = tmp_path / "warm-anomaly.jpg"
    assert cv2.imwrite(str(image_path), image) is True

    service = CVModelService(model_path=str(tmp_path / "missing-best.pt"))

    assert service.is_available() is True
    assert service.is_yolo_available() is False
    assert service.detection_mode == "heuristic"
    assert service.model_version == "heuristic-cv-v2"

    detections = service.detect(str(image_path), confidence_threshold=0.5)

    assert detections
    assert any(detection["source"] == "heuristic" for detection in detections)
    assert all(detection["class_name"] != "Heuristic-Anomaly" for detection in detections)
    assert any(detection["class_name"] == "Electrical-damage" for detection in detections)


def test_cv_service_loads_classification_models_and_returns_bbox_none(tmp_path, monkeypatch):
    image = np.zeros((256, 256, 3), dtype=np.uint8)
    image_path = tmp_path / "dusty-panel.jpg"
    assert cv2.imwrite(str(image_path), image) is True

    fake_result = FakeClassificationResult(
        top1=1,
        top1conf=0.9142,
        names={1: "Dusty"},
    )
    fake_model = FakeClassificationModel(fake_result, names={1: "Dusty"})
    model_path = tmp_path / "best-cls.pt"
    model_path.write_bytes(b"stub")

    monkeypatch.setattr(cv_service_module, "_load_yolo", lambda: (lambda _path: fake_model))

    service = CVModelService(model_path=str(model_path))
    detections = service.detect(str(image_path), confidence_threshold=0.5)

    assert service.detection_mode == "classification"
    assert service.model_task == "classification"
    assert service.model_version == "yolov8-solar-cls-v1"
    assert detections == [
        {
            "class_id": 1,
            "class_name": "Dusty",
            "confidence": 0.9142,
            "bbox": None,
        }
    ]


def test_cv_service_filters_low_confidence_full_frame_physical_damage(tmp_path, monkeypatch):
    image = np.zeros((256, 256, 3), dtype=np.uint8)
    image[:] = (120, 80, 40)
    for offset in range(-50, 300, 60):
        cv2.line(image, (offset, 0), (offset + 120, 255), (240, 240, 240), 2)
    for offset in range(-80, 320, 70):
        cv2.line(image, (0, offset), (255, offset + 90), (220, 220, 220), 1)

    image_path = tmp_path / "clean-panel-like.jpg"
    assert cv2.imwrite(str(image_path), image) is True

    fake_result = FakeResult(
        boxes=[
            FakeBox(
                class_id=3,
                confidence=0.5893,
                xyxy=[0.0, 0.0, 256.0, 256.0],
            )
        ],
        names={3: "Physical-Damage"},
    )
    fake_model = FakeYoloModel(fake_result, names={3: "Physical-Damage"})

    def fake_load_model(self):
        self.model = fake_model
        self.model_path = "fake-best.pt"
        self.model_version = "yolov8-solar-v1"
        self.unavailable_reason = None
        self.detection_mode = "yolo"

    monkeypatch.setattr(CVModelService, "_load_model", fake_load_model)

    service = CVModelService(model_path="unused.pt")
    detections = service.detect(str(image_path), confidence_threshold=0.5)

    assert detections == []


def test_cv_service_keeps_localized_physical_damage_predictions(tmp_path, monkeypatch):
    image = np.zeros((256, 256, 3), dtype=np.uint8)
    image[:] = (120, 80, 40)
    image_path = tmp_path / "panel.jpg"
    assert cv2.imwrite(str(image_path), image) is True

    fake_result = FakeResult(
        boxes=[
            FakeBox(
                class_id=3,
                confidence=0.5893,
                xyxy=[24.0, 30.0, 96.0, 102.0],
            )
        ],
        names={3: "Physical-Damage"},
    )
    fake_model = FakeYoloModel(fake_result, names={3: "Physical-Damage"})

    def fake_load_model(self):
        self.model = fake_model
        self.model_path = "fake-best.pt"
        self.model_version = "yolov8-solar-v1"
        self.unavailable_reason = None
        self.detection_mode = "yolo"

    monkeypatch.setattr(CVModelService, "_load_model", fake_load_model)

    service = CVModelService(model_path="unused.pt")
    detections = service.detect(str(image_path), confidence_threshold=0.5)

    assert len(detections) == 1
    assert detections[0]["class_name"] == "Physical-Damage"


def test_cv_service_filters_thumbnail_full_frame_physical_damage_even_if_crack_like(tmp_path, monkeypatch):
    image = np.zeros((125, 126, 3), dtype=np.uint8)
    image[:] = (120, 80, 40)
    image_path = tmp_path / "thumbnail-panel.jpg"
    assert cv2.imwrite(str(image_path), image) is True

    fake_result = FakeResult(
        boxes=[
            FakeBox(
                class_id=3,
                confidence=0.5893,
                xyxy=[0.0, 0.0, 125.6365, 124.4548],
            )
        ],
        names={3: "Physical-Damage"},
    )
    fake_model = FakeYoloModel(fake_result, names={3: "Physical-Damage"})

    def fake_load_model(self):
        self.model = fake_model
        self.model_path = "fake-best.pt"
        self.model_version = "yolov8-solar-v1"
        self.unavailable_reason = None
        self.detection_mode = "yolo"

    def fake_compute_crack_metrics(_self, _image):
        return {
            "edge_ratio": 0.11,
            "entropy_norm": 0.62,
            "largest_ratio": 0.07,
            "crack_score": 0.93,
            "crack_bbox": (0, 0, 125, 124),
            "is_crack_like": True,
        }

    monkeypatch.setattr(CVModelService, "_load_model", fake_load_model)
    monkeypatch.setattr(CVModelService, "_compute_crack_metrics", fake_compute_crack_metrics)

    service = CVModelService(model_path="unused.pt")
    detections = service.detect(str(image_path), confidence_threshold=0.5)

    assert detections == []


def test_cv_service_filters_panel_line_like_localized_physical_damage(tmp_path, monkeypatch):
    image = np.zeros((250, 250, 3), dtype=np.uint8)
    image[:] = (120, 80, 40)
    image_path = tmp_path / "panel-lines.jpg"
    assert cv2.imwrite(str(image_path), image) is True

    fake_result = FakeResult(
        boxes=[
            FakeBox(
                class_id=3,
                confidence=0.5893,
                xyxy=[0.0, 0.0, 125.6365, 124.4548],
            )
        ],
        names={3: "Physical-Damage"},
    )
    fake_model = FakeYoloModel(fake_result, names={3: "Physical-Damage"})

    def fake_load_model(self):
        self.model = fake_model
        self.model_path = "fake-best.pt"
        self.model_version = "yolov8-solar-v1"
        self.unavailable_reason = None
        self.detection_mode = "yolo"

    def fake_compute_crack_metrics(_self, _image):
        return {
            "edge_ratio": 0.23,
            "entropy_norm": 0.3464,
            "largest_ratio": 0.07,
            "crack_score": 0.91,
            "crack_bbox": (0, 0, 125, 124),
            "is_crack_like": True,
            "dominant_share": 0.7273,
            "mean_line_length": 70.67,
            "max_line_length": 132.61,
        }

    monkeypatch.setattr(CVModelService, "_load_model", fake_load_model)
    monkeypatch.setattr(CVModelService, "_compute_crack_metrics", fake_compute_crack_metrics)

    service = CVModelService(model_path="unused.pt")
    detections = service.detect(str(image_path), confidence_threshold=0.5)

    assert detections == []
