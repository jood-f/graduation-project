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
