
# Import required libraries
import os
import random
import shutil
import warnings
from datetime import datetime
from pathlib import Path

# Image processing and augmentation libraries
import albumentations as A
import cv2
import matplotlib
import matplotlib.pyplot as plt
import numpy as np

# Machine learning libraries
import torch
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from tqdm import tqdm

# YOLO model from Ultralytics
from ultralytics import YOLO

warnings.filterwarnings("ignore")
matplotlib.use("Agg")


# 1- PATH CONFIGURATION

# Get current script directory
SCRIPT_DIR = Path(__file__).resolve().parent
# Dataset folder (contains class folders)
DATASET_PATH = SCRIPT_DIR / "Solar_panel_Images"
# Output folders for results
BASE_OUTPUT = SCRIPT_DIR / "YOLO_RESULTS"
RESULTS_DIR = BASE_OUTPUT / f"run_{datetime.now():%Y%m%d_%H%M%S}"
# Folder for cleaned dataset (after removing duplicates)
DEDUP_ROOT = RESULTS_DIR / "deduplicated_dataset"
# Folder for classification dataset (train/val/test)
CLS_ROOT = RESULTS_DIR / "classify_dataset"

# 2- HYPERPARAMETERS
IMG_SIZE = 640 # Image size for training
TARGET_PER_CLASS = 800 # Target sample size per category

# Dataset split ratios
TRAIN_RATIO = 0.70
VAL_RATIO = 0.15
TEST_RATIO = 0.15

VAL_FROM_TRAIN_VAL_RATIO = VAL_RATIO / (TRAIN_RATIO + VAL_RATIO)
TARGET_TRAIN_PER_CLASS = int(round(TARGET_PER_CLASS * TRAIN_RATIO))

# Duplicate detection threshold
DUP_THRESHOLD = 4

# Supported image formats
SUPPORTED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp"}

# Training configuration
CLASSIFICATION_BACKBONE = os.getenv("CV_CLASSIFICATION_BACKBONE", "yolov8n-cls.pt").strip() or "yolov8n-cls.pt"
CLASSIFICATION_EPOCHS = int(os.getenv("CV_CLASSIFICATION_EPOCHS", "80"))
CLASSIFICATION_BATCH = int(os.getenv("CV_CLASSIFICATION_BATCH", "6"))
CLASSIFICATION_PATIENCE = int(os.getenv("CV_CLASSIFICATION_PATIENCE", "30"))
PROMOTE_CLASSIFIER_TO_RUNTIME = (
    str(os.getenv("CV_PROMOTE_CLASSIFIER_TO_RUNTIME", "false")).strip().lower()
    in {"1", "true", "yes", "on"}
)

# Fix randomness for reproducibility
random.seed(42)
np.random.seed(42)


# 3- DEVICE SETUP (GPU/CPU)
    # This function checks if GPU is available
    # Select the best available device:
    # CUDA GPU (fastest)
    # Apple MPS
    # CPU (slowest)

def get_device() -> str:
    print("GPU INITIALIZATION")
    if torch.cuda.is_available():
        device = "cuda"
        print(f" NVIDIA GPU (CUDA) ACTIVE: {torch.cuda.get_device_name(0)}")
    elif torch.backends.mps.is_available():
        device = "mps"
        print(" Apple Silicon GPU (MPS) ACTIVE")
    else:
        device = "cpu"
        print(" CPU mode - Training will be slow.")
    print(f"Device: {device} | PyTorch: {torch.__version__}\n")
    return device

# Store selected device
DEVICE = get_device()

# 4- IMAGE DEDUPLICATION FUNCTIONS
# Generate a hash value for an image
# This helps detect duplicate or very similar images
def dhash_64(img_rgb: np.ndarray, hash_size: int = 8) -> int:
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
     # Resize image to small size
    gray = cv2.resize(gray, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
    # Compare adjacent pixels
    diff = gray[:, 1:] > gray[:, :-1]
    # Convert to binary hash
    digest = 0
    for bit in diff.flatten():
        digest = (digest << 1) | int(bit)
    return digest

# Calculate difference between two hashes
def hamming_distance(left: int, right: int) -> int:
    return bin(left ^ right).count("1")

# Check if image is duplicate using hash distanc
def is_duplicate(new_hash: int, hashes: set[int], threshold: int = 5) -> bool:
    return any(hamming_distance(new_hash, seen_hash) <= threshold for seen_hash in hashes)

# 5- DATA AUGMENTATION

# Create augmentation pipeline to increase dataset size
def build_augmentation_pipeline() -> A.Compose:
    return A.Compose(
        [
            A.RandomResizedCrop(size=(IMG_SIZE, IMG_SIZE), scale=(0.8, 1.0), ratio=(0.9, 1.1), p=0.95),
            A.Rotate(limit=25, border_mode=cv2.BORDER_REFLECT_101, p=0.6),
            A.Affine(scale=(0.9, 1.1), translate_percent=(-0.08, 0.08), shear=(-10, 10), p=0.45),
            A.HorizontalFlip(p=0.5),
            A.RandomBrightnessContrast(brightness_limit=0.35, contrast_limit=0.35, p=0.6),
            A.RandomGamma(gamma_limit=(70, 135), p=0.35),
            A.CLAHE(clip_limit=3.0, tile_grid_size=(8, 8), p=0.25),
            A.GaussNoise(std_range=(0.03, 0.12), p=0.25),
            A.GaussianBlur(blur_limit=(3, 5), p=0.15),
            A.MotionBlur(blur_limit=5, p=0.1),
            A.RandomRain(p=0.08),
            A.RandomFog(p=0.08),
            A.RandomSunFlare(p=0.04),
            A.HueSaturationValue(hue_shift_limit=10, sat_shift_limit=18, val_shift_limit=10, p=0.25),
        ],
        p=1.0,
    )

# 6- DATA LOADING FUNCTIONS

# Read class names from dataset folders
def get_classes() -> list[str]:
    classes = sorted(
        [
            directory.name
            for directory in DATASET_PATH.iterdir()
            if directory.is_dir() and directory.name != "Bird-drop" and not directory.name.startswith(".")
        ]
    )
    if not classes:
        raise RuntimeError(f"No classes found under {DATASET_PATH}")
    return classes

# Get all image files in a folder
def list_image_files(directory: Path) -> list[Path]:
    return sorted(
        path for path in directory.iterdir() if path.is_file() and path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES
    )

# Load image and convert to RGB format
def read_rgb_image(image_path: Path) -> np.ndarray | None:
    image = cv2.imread(str(image_path))
    if image is None:
        return None

    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    if image_rgb.shape[:2] != (IMG_SIZE, IMG_SIZE):
        image_rgb = cv2.resize(image_rgb, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_CUBIC)
    return image_rgb

# 7- DATA PREPARATION

# Remove duplicate images from dataset
def prepare_deduplicated_originals(classes: list[str]) -> dict[str, list[Path]]:
    print("PHASE 1: DEDUPLICATION OF ORIGINALS")
    deduplicated_files: dict[str, list[Path]] = {}

    for class_name in classes:
        src_dir = DATASET_PATH / class_name
        dst_dir = DEDUP_ROOT / class_name
        dst_dir.mkdir(parents=True, exist_ok=True)

        unique_paths: list[Path] = []
        seen_hashes: set[int] = set()
        image_files = list_image_files(src_dir)

        print(f"Class '{class_name}': Found {len(image_files)} images")
        for image_path in image_files:
            image_rgb = read_rgb_image(image_path)
            if image_rgb is None:
                continue

            image_hash = dhash_64(image_rgb)
            # Skip duplicate images
            if is_duplicate(image_hash, seen_hashes, DUP_THRESHOLD):
                continue

            seen_hashes.add(image_hash)
            output_path = dst_dir / f"{class_name}_orig_{len(unique_paths):04d}.jpg"
            cv2.imwrite(str(output_path), cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR))
            unique_paths.append(output_path)

        deduplicated_files[class_name] = unique_paths
        print(f"  Unique originals kept: {len(unique_paths)}\n")

    return deduplicated_files

# 7- Training

def build_classification_dataset(classes: list[str], deduplicated_files: dict[str, list[Path]]) -> Path:
    print("PHASE 2: CLASSIFICATION SPLIT (70% / 15% / 15% UNIQUE ORIGINALS)")
    print(f" Target augmented train size per class: {TARGET_TRAIN_PER_CLASS}")
    # Build augmentation pipeline (for increasing training data)
    augmentation = build_augmentation_pipeline()

 # Create directory structure: train / val / test for each class
    for split in ("train", "val", "test"):
        for class_name in classes:
            (CLS_ROOT / split / class_name).mkdir(parents=True, exist_ok=True)

# Process each class separately
    for class_name in classes:
        image_files = deduplicated_files[class_name]
        # Ensure enough images exist to split dataset
        if len(image_files) < 3:
            raise RuntimeError(f"Need at least 3 unique images in class '{class_name}' to build train/val/test splits.")

     # First split
        train_val, test_set = train_test_split(
            image_files,
            test_size=TEST_RATIO,
            random_state=42,
            shuffle=True,
        )
         # Second split
        train_set, val_set = train_test_split(
            train_val,
            test_size=VAL_FROM_TRAIN_VAL_RATIO,
            random_state=42,
            shuffle=True,
        )
        # Store splits in dictionary
        splits = {
            "train": train_set,
            "val": val_set,
            "test": test_set,
        }
        # Copy images into respective folders
        for split_name, files in splits.items():
            for image_path in files:
                shutil.copy2(image_path, CLS_ROOT / split_name / class_name / image_path.name)
        # Calculate how many augmented images are needed
        needed = max(0, TARGET_TRAIN_PER_CLASS - len(train_set))
        # Path to training directory
        train_dir = CLS_ROOT / "train" / class_name
        # Load training images for augmentation
        train_sources = [
            (image_path, image_rgb)
            for image_path in train_set
            if (image_rgb := read_rgb_image(image_path)) is not None
        ]

         # Perform augmentation if needed
        if needed > 0 and train_sources:
            for index in tqdm(range(needed), desc=f"Aug {class_name}", leave=False):
                # Randomly pick an image
                source_path, source_image = random.choice(train_sources)
                source_stem = source_path.stem
                # Apply augmentation
                augmented = augmentation(image=source_image)["image"]
                 # Ensure image is uint8 format
                if augmented.dtype != np.uint8:
                    if augmented.max() <= 1.0:
                        augmented = (augmented * 255).astype(np.uint8)
                    else:
                        augmented = np.clip(augmented, 0, 255).astype(np.uint8)
                        # Resize if needed
                if augmented.shape[:2] != (IMG_SIZE, IMG_SIZE):
                    augmented = cv2.resize(augmented, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_CUBIC)
                # Save augmented image
                output_path = train_dir / f"{source_stem}_aug_{index:06d}.jpg"
                cv2.imwrite(str(output_path), cv2.cvtColor(augmented, cv2.COLOR_RGB2BGR))
        
        # Count final number of training images
        final_train_count = len(list_image_files(train_dir))

        # Print summary for this class
        print(
            f"  {class_name}: train_original={len(train_set)} | val={len(val_set)} | "
            f"test={len(test_set)} | train_augmented={needed} | final_train={final_train_count}"
        )

    # Print final dataset location 
    print(f"\nClassification dataset: {CLS_ROOT}\n")
    return CLS_ROOT


def resolve_backbone_path(model_name: str) -> str:
    # Check if model exists locally
    local_path = SCRIPT_DIR / model_name
    if local_path.exists():
        return str(local_path)
    return model_name


def resolve_prediction_name(result, model) -> tuple[str, float]:
      # Extract probability object
    probs = getattr(result, "probs", None)
    if probs is None:
        return "unknown", 0.0
     # Get top prediction index and confidence
    top1 = int(getattr(probs, "top1", -1))
    top1_conf = float(getattr(probs, "top1conf", 0.0))
     # Get class names mapping
    names = getattr(result, "names", None) or getattr(model, "names", None) or {}

    # Resolve class name depending on type
    if isinstance(names, dict) and top1 in names:
        return str(names[top1]), top1_conf
    if isinstance(names, (list, tuple)) and 0 <= top1 < len(names):
        return str(names[top1]), top1_conf
    # Fallback name
    return f"class_{top1}", top1_conf


def evaluate_split(model: YOLO, split_name: str, classes: list[str]) -> dict[str, float | str]:
    # Path to dataset split
    split_root = CLS_ROOT / split_name
    # Collect all image paths
    image_paths = sorted(path for class_name in classes for path in list_image_files(split_root / class_name))

    y_true: list[str] = []
    y_pred: list[str] = []

    # Run inference on each image
    for image_path in tqdm(image_paths, desc=f"Eval {split_name}", leave=False):
        result = model.predict(str(image_path), verbose=False, device=DEVICE)[0]
        predicted_name, _ = resolve_prediction_name(result, model)
        y_true.append(image_path.parent.name)
        y_pred.append(predicted_name)

    # Compute evaluation metrics
    metrics = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_weighted": float(precision_score(y_true, y_pred, average="weighted", zero_division=0)),
        "recall_weighted": float(recall_score(y_true, y_pred, average="weighted", zero_division=0)),
        "f1_weighted": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
    }

    # Generate detailed report and confusion matrix
    report = classification_report(y_true, y_pred, labels=classes, zero_division=0)
    matrix = confusion_matrix(y_true, y_pred, labels=classes)
     # Save results 
    (RESULTS_DIR / f"{split_name}_classification_report.txt").write_text(report, encoding="utf-8")
    np.savetxt(RESULTS_DIR / f"{split_name}_confusion_matrix.csv", matrix, fmt="%d", delimiter=",")

    # Print results
    print(f"{split_name.title()} metrics: {metrics}")
    print(report)
    return metrics


def plot_sample_predictions(model: YOLO, classes: list[str]) -> None:
    print("PHASE 5: PREDICTIONS VISUALIZATION")
    # Load test images
    test_images = sorted(path for class_name in classes for path in list_image_files(CLS_ROOT / "test" / class_name))
    # Randomly sample images (max 12)
    sample = random.sample(test_images, min(12, len(test_images)))
    if not sample:
        print("No test images available for visualization.")
        return
    # Create plotting grid
    fig, axes = plt.subplots(3, 4, figsize=(20, 12))
    axes = axes.flatten()

    for index, image_path in enumerate(sample):
        # Load and convert image
        image_bgr = cv2.imread(str(image_path))
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        # Predict class
        result = model.predict(str(image_path), verbose=False, device=DEVICE)[0]
        predicted_name, confidence = resolve_prediction_name(result, model)

        # Display image with prediction
        axes[index].imshow(image_rgb)
        axes[index].set_title(
            f"gt: {image_path.parent.name}\npred: {predicted_name} ({confidence:.0%})",
            fontsize=9,
        )
        axes[index].axis("off")

    for axis in axes[len(sample):]:
        axis.axis("off")

     # Save figure
    plt.tight_layout()
    output_path = RESULTS_DIR / "classification_predictions.png"
    plt.savefig(output_path, dpi=200, bbox_inches="tight")
    print(f" Saved: {output_path}")
    plt.close()


def promote_runtime_weights(best_model_path: Path) -> None:
    # Save a stable classifier file
    stable_classifier_path = SCRIPT_DIR / "best-cls.pt"
    shutil.copy2(best_model_path, stable_classifier_path)
    print(f" Stable classifier export: {stable_classifier_path}")
     # Optionally overwrite runtime model
    if PROMOTE_CLASSIFIER_TO_RUNTIME:
        runtime_path = SCRIPT_DIR / "best.pt"
        shutil.copy2(best_model_path, runtime_path)
        print(f" Runtime export updated: {runtime_path}")
    else:
        print(" Runtime export unchanged. Set CV_PROMOTE_CLASSIFIER_TO_RUNTIME=true to overwrite CV/best.pt.")

    # Start training phase
def train_classification_model(classes: list[str]) -> Path:
    print(f"PHASE 3: YOLO CLASSIFICATION TRAINING ON {DEVICE.upper()}")
    # Load model backbone
    backbone_path = resolve_backbone_path(CLASSIFICATION_BACKBONE)
    model = YOLO(backbone_path)
    # Train model
    model.train(
        data=str(CLS_ROOT),
        epochs=CLASSIFICATION_EPOCHS,
        imgsz=IMG_SIZE,
        batch=CLASSIFICATION_BATCH,
        device=DEVICE,
        workers=0,
        patience=CLASSIFICATION_PATIENCE,
        amp=False,
        project=str(RESULTS_DIR / "runs"),
        name="classify_train",
        save=True,
        verbose=True,
        optimizer="AdamW",
        lr0=0.001,
        lrf=0.01,
        weight_decay=0.0005,
        dropout=0.0,
        degrees=15,
        translate=0.05,
        scale=0.2,
        fliplr=0.5,
        flipud=0.0,
        hsv_h=0.02,
        hsv_s=0.75,
        hsv_v=0.4,
        erasing=0.25,
    )
     # Load best trained model
    best_model_path = RESULTS_DIR / "runs" / "classify_train" / "weights" / "best.pt"
    best_model = YOLO(str(best_model_path))

    print("\nPHASE 4: EVALUATION")
    # Evaluate on validation and test sets
    evaluate_split(best_model, "val", classes)
    evaluate_split(best_model, "test", classes)
    # Visualize predictions
    plot_sample_predictions(best_model, classes)
    # Save and export model
    promote_runtime_weights(best_model_path)
    return best_model_path

# Check if dataset folder exists before starting
def main() -> None:
    if not DATASET_PATH.exists():
        print(f"ERROR: {DATASET_PATH} not found!")
        return

    print("This pipeline now trains a classification model for broad surface classes.")
    print("Use real localized annotations only if you later add a separate detector.\n")

# Create output directories (if they don’t already exist)
    BASE_OUTPUT.mkdir(parents=True, exist_ok=True) # Root output folder
    DEDUP_ROOT.mkdir(parents=True, exist_ok=True)  # Deduplicated dataset folder
    CLS_ROOT.mkdir(parents=True, exist_ok=True)    # Classification dataset folder

# Load class names from dataset directory
    classes = get_classes()
    print(f"Classes found: {classes}\n")
# Phase 1: Remove duplicate images and keep unique ones
    deduplicated_files = prepare_deduplicated_originals(classes)
# Phase 2: Split dataset into train/val/test and apply augmentation
    build_classification_dataset(classes, deduplicated_files)
 # Phase 3: Train YOLO classification model
    best_model_path = train_classification_model(classes)

    # Final summary output
    print("\nTRAINING COMPLETE!: Model successfully trained and evaluated")
    print(f"Results: {RESULTS_DIR}") # Where all outputs are saved
    print(f"Best classification model: {best_model_path}") # Path to best trained model
    print(f"Stable classifier export: {SCRIPT_DIR / 'best-cls.pt'}") 


if __name__ == "__main__":
    main()
