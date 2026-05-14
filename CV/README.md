# CV Pipeline

The CV training pipeline is now classification-first for the broad solar panel surface classes:

- `Clean`
- `Dusty`
- `Electrical-damage`
- `Physical-Damage`
- `Snow-Covered`

Why this changed:

- The previous detector pipeline wrote the same full-image box for every sample.
- That made YOLO behave like an image classifier while still outputting bounding boxes.
- Broad surface conditions such as dust and snow were frequently confused with `Physical-Damage`.

## Training

Run:

```powershell
python CV/yolov8.py
```

Outputs are written under `CV/YOLO_RESULTS/run_YYYYMMDD_HHMMSS/`.

Methodology note:

- The pipeline now deduplicates each class first, splits the unique originals into `train` / `val` / `test`, and augments only the `train` split.
- This avoids augmented variants of the same source image leaking across evaluation splits.
- `train` is balanced up to 560 images per class after augmentation, while `val` and `test` stay unaugmented.

Important artifacts:

- `deduplicated_dataset/`: unique originals kept after perceptual deduplication
- `classify_dataset/`: train/val/test classification folders
- `runs/classify_train/weights/best.pt`: best trained classifier
- `best-cls.pt`: stable copy of the latest trained classifier

If you want to overwrite `CV/best.pt` after a successful classification run, set:

```powershell
$env:CV_PROMOTE_CLASSIFIER_TO_RUNTIME='true'
python CV/yolov8.py
```

## Backend Runtime

The backend now prefers classification weights in this order when available:

- `CV_CLASSIFICATION_MODEL_PATH`
- `CV/best-cls.pt`
- latest `CV/YOLO_RESULTS/.../runs/classify_train/weights/best.pt`

If no classification model is found, it falls back to the older detector weights.

## CV Model Testing

The current CV model is the YOLOv8 classification model trained with `yolov8n-cls.pt`.
It was evaluated using the held-out test split from the classification dataset.
Because the current model performs image-level classification, the final evaluation uses
classification metrics instead of detector metrics such as mAP50.

| Metric | Result |
| --- | ---: |
| Test accuracy | 0.84 |
| Macro precision | 0.86 |
| Macro recall | 0.85 |
| Macro F1-score | 0.86 |
| Weighted F1-score | 0.84 |
| Test samples | 96 |

Class-level test results:

| Class | Precision | Recall | F1-score | Support |
| --- | ---: | ---: | ---: | ---: |
| Clean | 0.81 | 0.76 | 0.79 | 29 |
| Dusty | 0.80 | 0.88 | 0.84 | 32 |
| Electrical-damage | 0.82 | 0.75 | 0.78 | 12 |
| Physical-Damage | 0.88 | 0.88 | 0.88 | 8 |
| Snow-Covered | 1.00 | 1.00 | 1.00 | 15 |

Current evaluation artifacts:

- `CV/YOLO_RESULTS/run_20260423_112841/test_classification_report.txt`
- `CV/YOLO_RESULTS/run_20260423_112841/test_confusion_matrix.csv`
- `CV/YOLO_RESULTS/run_20260423_112841/evaluation_diagrams/test_confusion_matrix_counts.png`
- `CV/YOLO_RESULTS/run_20260423_112841/evaluation_diagrams/test_confusion_matrix_normalized.png`
- `CV/YOLO_RESULTS/report_graphs/new_cv_classification_confusion_matrix_counts.png`
- `CV/YOLO_RESULTS/report_graphs/new_cv_classification_confusion_matrix_normalized.png`

Historical note: the older YOLOv8 detection pipeline reported detector metrics such as
precision, recall, mAP50, and mAP50-95, but that pipeline used full-image bounding boxes.
Those detector results should not be reported as the final classifier performance.
The older detector confusion-matrix graphs generated for report comparison are stored in:

- `CV/YOLO_RESULTS/report_graphs/old_cv_detection_confusion_matrix_counts.png`
- `CV/YOLO_RESULTS/report_graphs/old_cv_detection_confusion_matrix_normalized.png`

If mobile phone and Nikon camera images are included in the manual testing evidence, record the individual predictions in this format:

| Image source | Expected class | Predicted class | Confidence | Result |
| --- | --- | --- | ---: | --- |
| Mobile phone image |  |  |  |  |
| Nikon camera image |  |  |  |  |
