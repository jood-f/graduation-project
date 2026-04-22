import cv2
import numpy as np

from app.services.cv_service import CVModelService


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
