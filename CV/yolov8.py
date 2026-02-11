
import os
import sys
import subprocess
import time
from datetime import datetime

# Install required packages
print("=" * 70)
print("INSTALLING REQUIREMENTS...")
print("=" * 70)

required_packages = [
    'opencv-contrib-python', 'numpy', 'albumentations', 
    'scikit-learn', 'matplotlib', 'tqdm', 'pyyaml', 'ultralytics'
]

for package in required_packages:
    try:
        __import__(package.replace('-', '_'))
        print(f"✓ {package}")
    except ImportError:
        print(f"Installing {package}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package, "-q"])

# IMPORTS
import os
import glob
import random
import shutil
import csv
import cv2
import numpy as np
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  
import albumentations as A
from tqdm import tqdm
from collections import Counter
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix
)
from ultralytics import YOLO
import yaml
import torch

# CHECK GPU AVAILABILITY
print("=" * 70)
print("GPU CHECK")
print("=" * 70)
if torch.cuda.is_available():
    DEVICE = 0  # Use first GPU
    print(f"✓ CUDA Available: {torch.cuda.get_device_name(0)}")
    print(f"  GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
else:
    DEVICE = 'cpu'
    print("✗ No GPU detected, using CPU (training will be slow)")

# CONFIGURATION
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(SCRIPT_DIR, "Solar_panel_Images")
BASE_OUTPUT = os.path.join(SCRIPT_DIR, "YOLO_RESULTS")

# Create output directory
os.makedirs(BASE_OUTPUT, exist_ok=True)
RESULTS_DIR = os.path.join(BASE_OUTPUT, f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
os.makedirs(RESULTS_DIR, exist_ok=True)

# Paths
OUT_AUG = os.path.join(RESULTS_DIR, "solar_aug_full")
OUT_SPLIT = os.path.join(RESULTS_DIR, "solar_split_70_20_10")
DET_ROOT = os.path.join(RESULTS_DIR, "solar_det")
RUNS_DIR = os.path.join(RESULTS_DIR, "runs")

# Helper functions
def imread_rgb(path):
    img = cv2.imread(path)
    if img is None:
        return None
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

def save_rgb(path, img_rgb):
    cv2.imwrite(path, cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR))

def unique_name(out_dir, filename):
    name = filename
    k = 1
    while os.path.exists(os.path.join(out_dir, name)):
        name = f"{os.path.splitext(filename)[0]}_{k}.jpg"
        k += 1
    return name

def dhash_64(img_rgb, hash_size=8):
    g = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    g = cv2.resize(g, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
    diff = g[:, 1:] > g[:, :-1]
    bits = diff.flatten()
    h = 0
    for b in bits:
        h = (h << 1) | int(b)
    return h

def hamming(a, b):
    return (a ^ b).bit_count()

def is_near_duplicate(h_new, hashes, threshold):
    for h in hashes:
        if hamming(h_new, h) <= threshold:
            return True
    return False

def copy_many(paths, dest_dir):
    for p in paths:
        shutil.copy2(p, os.path.join(dest_dir, os.path.basename(p)))


def main():
    print(f"\n Results saved to: {RESULTS_DIR}\n")

    # COLLECT IMAGES AND LABELS
    print("=" * 70)
    print("COLLECTING IMAGES AND LABELS")
    print("=" * 70)

    valid_ext = (".jpg", ".jpeg", ".png", ".bmp", ".JPG", ".JPEG", ".PNG")
    exclude_folder = "Bird-drop"

    image_paths = []
    labels = []

    for label in sorted(os.listdir(DATASET_PATH)):
        folder = os.path.join(DATASET_PATH, label)
        if not os.path.isdir(folder) or label == exclude_folder:
            continue
        
        files = [f for f in glob.glob(os.path.join(folder, "*")) if f.endswith(valid_ext)]
        image_paths.extend(files)
        labels.extend([label] * len(files))
        print(f"  {label}: {len(files)} images")

    # Remove duplicates
    pairs = list(dict.fromkeys(zip(image_paths, labels)))
    image_paths, labels = map(list, zip(*pairs))

    print(f"\n Total images: {len(image_paths)}")
    print(f" Classes: {len(set(labels))}")
    print(f" Class names: {sorted(set(labels))}")

    # DATA QUALITY CHECKS
    print("\n" + "=" * 70)
    print(" DATA QUALITY CHECKS")
    print("=" * 70)

    if len(image_paths) == len(labels):
        print(" Every image has a label")
    else:
        print(" Image-label mismatch!")

    bad_images = []
    print("Scanning for corrupted images...")
    for img in tqdm(image_paths):
        if cv2.imread(img) is None:
            bad_images.append(img)

    if len(bad_images) == 0:
        print(" All images are readable")
    else:
        print(f" Found {len(bad_images)} corrupted images")

    class_counts = Counter(labels)
    print("\nClass distribution:")
    for cls in sorted(class_counts):
        print(f"  {cls}: {class_counts[cls]} images")

    # LABEL ENCODING
    print("\n" + "=" * 70)
    print(" LABEL ENCODING")
    print("=" * 70)

    le = LabelEncoder()
    encoded_labels = le.fit_transform(labels)

    print("\nClass mapping:")
    for idx, cls in enumerate(le.classes_):
        print(f"  {idx} → {cls}")

    # DATA AUGMENTATION
    print("\n" + "=" * 70)
    print(" DATA AUGMENTATION")
    print("=" * 70)

    IMG_SIZE = 224
    TARGET_PER_CLASS = 500
    NEAR_DUP_THRESHOLD = 6

    aug = A.Compose([
        A.RandomResizedCrop(size=(IMG_SIZE, IMG_SIZE), scale=(0.80, 1.0), ratio=(0.90, 1.10), p=1.0),
        A.OneOf([
            A.Rotate(limit=20, border_mode=cv2.BORDER_REFLECT_101, p=1.0),
            A.Affine(rotate=(-20, 20), translate_percent=(0.0, 0.06), scale=(0.9, 1.1), shear=(-6, 6), p=1.0),
        ], p=0.8),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.15),
        A.RandomBrightnessContrast(p=0.6),
        A.OneOf([A.GaussianBlur(blur_limit=(3,7), p=1.0), A.MotionBlur(blur_limit=(3,7), p=1.0)], p=0.25),
        A.GaussNoise(std_range=(0.01, 0.05), p=0.3),
    ], p=1.0)

    if os.path.exists(OUT_AUG):
        shutil.rmtree(OUT_AUG)
    os.makedirs(OUT_AUG, exist_ok=True)

    classes = sorted([d for d in os.listdir(DATASET_PATH) if os.path.isdir(os.path.join(DATASET_PATH, d)) and d != exclude_folder])
    mapping_csv = os.path.join(OUT_AUG, "augmentation_mapping.csv")

    with open(mapping_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["class", "original_path", "generated_path"])
        
        for c in classes:
            in_dir = os.path.join(DATASET_PATH, c)
            out_dir = os.path.join(OUT_AUG, c)
            os.makedirs(out_dir, exist_ok=True)

            originals = sorted([p for p in glob.glob(os.path.join(in_dir, "*")) if p.endswith(valid_ext)])
            if len(originals) == 0:
                print(f"[{c}] no images")
                continue

            if len(originals) > TARGET_PER_CLASS:
                originals = random.sample(originals, TARGET_PER_CLASS)

            seen_hashes = []

            for p in originals:
                im = imread_rgb(p)
                if im is None: 
                    continue
                if im.shape[:2] != (IMG_SIZE, IMG_SIZE):
                    im = cv2.resize(im, (IMG_SIZE, IMG_SIZE))
                h = dhash_64(im)
                if is_near_duplicate(h, seen_hashes, NEAR_DUP_THRESHOLD):
                    continue
                seen_hashes.append(h)
                dst = unique_name(out_dir, os.path.basename(p))
                dst_path = os.path.join(out_dir, dst)
                shutil.copy2(p, dst_path)
                writer.writerow([c, p, dst_path])

            cur = len([f for f in glob.glob(os.path.join(out_dir, "*")) if f.endswith(valid_ext)])
            need = max(0, TARGET_PER_CLASS - cur)
            print(f"[{c}] kept originals={cur}, need_aug={need}")

            # Augment until target
            i, tries = 0, 0
            pbar = tqdm(total=need, desc=f"Augmenting {c}")
            while i < need:
                tries += 1
                src = random.choice(originals)
                im = imread_rgb(src)
                if im is None: 
                    continue
                out = aug(image=im)["image"]
                if out.shape[:2] != (IMG_SIZE, IMG_SIZE):
                    out = cv2.resize(out, (IMG_SIZE, IMG_SIZE))
                h = dhash_64(out)
                if is_near_duplicate(h, seen_hashes, NEAR_DUP_THRESHOLD):
                    if tries > 50000:
                        print(f"[{c}] too many near duplicates.")
                        break
                    continue
                seen_hashes.append(h)
                base = os.path.splitext(os.path.basename(src))[0]
                fname = unique_name(out_dir, f"{base}_aug_{i:05d}.jpg")
                gen_path = os.path.join(out_dir, fname)
                save_rgb(gen_path, out)
                writer.writerow([c, src, gen_path])
                i += 1
                pbar.update(1)
            pbar.close()

    print(f"\n Augmented dataset saved in: {OUT_AUG}")

    # SPLIT DATASET
    print("\n" + "=" * 70)
    print(" SPLITTING DATASET (70/20/10)")
    print("=" * 70)

    if os.path.exists(OUT_SPLIT):
        shutil.rmtree(OUT_SPLIT)
    os.makedirs(OUT_SPLIT, exist_ok=True)

    train_root = os.path.join(OUT_SPLIT, "train")
    val_root   = os.path.join(OUT_SPLIT, "val")
    test_root  = os.path.join(OUT_SPLIT, "test")
    os.makedirs(train_root, exist_ok=True)
    os.makedirs(val_root, exist_ok=True)
    os.makedirs(test_root, exist_ok=True)

    classes = sorted([d for d in os.listdir(OUT_AUG) if os.path.isdir(os.path.join(OUT_AUG, d))])

    for c in classes:
        src_dir = os.path.join(OUT_AUG, c)
        imgs = sorted([p for p in glob.glob(os.path.join(src_dir, "*")) if p.endswith(valid_ext)])

        train_val, test = train_test_split(imgs, test_size=0.10, random_state=42, shuffle=True)
        train, val = train_test_split(train_val, test_size=0.2222, random_state=42, shuffle=True)

        os.makedirs(os.path.join(train_root, c), exist_ok=True)
        os.makedirs(os.path.join(val_root, c), exist_ok=True)
        os.makedirs(os.path.join(test_root, c), exist_ok=True)
        
        copy_many(train, os.path.join(train_root, c))
        copy_many(val, os.path.join(val_root, c))
        copy_many(test, os.path.join(test_root, c))

    print(f" Dataset split completed: {OUT_SPLIT}")

    # CREATE YOLO DETECTION DATASET
    print("\n" + "=" * 70)
    print(" CREATING YOLO DETECTION DATASET")
    print("=" * 70)

    NAMES = sorted(classes)

    for s in ["train","val","test"]:
        os.makedirs(os.path.join(DET_ROOT,"images",s), exist_ok=True)
        os.makedirs(os.path.join(DET_ROOT,"labels",s), exist_ok=True)

    name_to_id = {name:i for i,name in enumerate(NAMES)}
    FULL_BOX = "{cls} 0.5 0.5 1.0 1.0\n"

    for split in ["train","val","test"]:
        for cls in NAMES:
            src_cls_dir = os.path.join(OUT_SPLIT, split, cls)
            imgs = sorted([p for p in glob.glob(os.path.join(src_cls_dir,"*")) if p.endswith(valid_ext)])
            cls_id = name_to_id[cls]
            for img_path in imgs:
                base = os.path.splitext(os.path.basename(img_path))[0]
                out_img_name = f"{cls}_{base}.jpg"
                out_img_path = os.path.join(DET_ROOT,"images",split,out_img_name)
                out_lbl_path = os.path.join(DET_ROOT,"labels",split,f"{cls}_{base}.txt")
                shutil.copy2(img_path, out_img_path)
                with open(out_lbl_path,"w") as f:
                    f.write(FULL_BOX.format(cls=cls_id))

    data = {
        "path": DET_ROOT,
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": NAMES
    }
    yaml_path = os.path.join(DET_ROOT,"data.yaml")
    with open(yaml_path,"w") as f:
        yaml.dump(data,f,sort_keys=False)
    print(f" YOLO data.yaml saved: {yaml_path}")

    # YOLOV8 DETECTION TRAINING
    print("\n" + "=" * 70)
    print(" TRAINING YOLOV8 DETECTION MODEL")
    print("=" * 70)

    det = YOLO("yolov8n.pt")
    results = det.train(
        data=yaml_path,
        epochs=40,
        imgsz=640,
        batch=16,
        project=RUNS_DIR,
        name="detect_train",
        device=DEVICE,
        workers=0
    )

    print(" Training completed!")

    # EVALUATE AND VISUALIZE RESULTS
    print("\n" + "=" * 70)
    print(" EVALUATION AND VISUALIZATION")
    print("=" * 70)

    # Find model
    best_model_path = os.path.join(RUNS_DIR, "detect_train", "weights", "best.pt")
    det = YOLO(best_model_path)

    # Validation metrics
    print("\nCalculating metrics...")
    metrics = det.val(data=yaml_path, split="test", device=DEVICE)

    print(f"mAP50-95: {metrics.box.map:.4f}")
    print(f"mAP50: {metrics.box.map50:.4f}")

    # VISUALIZATION OF PREDICTIONS
    print("\n" + "=" * 70)
    print(" VISUALIZING PREDICTIONS")
    print("=" * 70)

    test_dir = os.path.join(DET_ROOT, "images", "test")
    test_imgs = sorted(glob.glob(os.path.join(test_dir, "*.*")))
    sample = random.sample(test_imgs, min(9, len(test_imgs)))

    print(f"Visualizing {len(sample)} test predictions...")
    fig, axes = plt.subplots(3, 3, figsize=(15, 15))
    axes = axes.flatten()

    for idx, img_path in enumerate(sample):
        result = det.predict(img_path, conf=0.25, verbose=False, device=DEVICE)[0]
        img_bgr = result.plot()
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        
        axes[idx].imshow(img_rgb)
        axes[idx].set_title(os.path.basename(img_path)[:20])
        axes[idx].axis('off')

    plt.tight_layout()
    viz_path = os.path.join(RESULTS_DIR, "predictions_visualization.png")
    plt.savefig(viz_path, dpi=150, bbox_inches='tight')
    print(f" Saved: {viz_path}")
    plt.close()

    # COMPUTE PERFORMANCE METRICS
    print("\n" + "=" * 70)
    print("STEP 10: COMPUTING PERFORMANCE METRICS")
    print("=" * 70)

    labels_val_dir = os.path.join(DET_ROOT, "labels", "test")
    val_image_paths = sorted(glob.glob(os.path.join(test_dir, "*.*")))

    NO_DET_ID = -1
    CONF_THRES = 0.25

    y_true, y_pred = [], []

    for img_path in tqdm(val_image_paths):
        stem = os.path.splitext(os.path.basename(img_path))[0]
        label_path = os.path.join(labels_val_dir, stem + ".txt")

        if not os.path.exists(label_path):
            continue

        with open(label_path, "r") as f:
            lines = [ln.strip() for ln in f.readlines() if ln.strip()]
        if not lines:
            continue

        gt_cls_id = int(lines[0].split()[0])
        res = det.predict(img_path, imgsz=640, conf=CONF_THRES, verbose=False, device=DEVICE)[0]

        if res.boxes is None or len(res.boxes) == 0:
            pred_cls_id = NO_DET_ID
        else:
            best_idx = int(res.boxes.conf.argmax().item())
            pred_cls_id = int(res.boxes.cls[best_idx].item())

        y_true.append(gt_cls_id)
        y_pred.append(pred_cls_id)

    y_true = np.array(y_true, dtype=int)
    y_pred = np.array(y_pred, dtype=int)

    print(f"\n Evaluated {len(y_true)} test images")

    # Calculate metrics
    acc = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, average="macro", zero_division=0)
    rec = recall_score(y_true, y_pred, average="macro", zero_division=0)
    f1 = f1_score(y_true, y_pred, average="macro", zero_division=0)

    print(f"\n{'=' * 70}")
    print("PERFORMANCE METRICS")
    print(f"{'=' * 70}")
    print(f"Accuracy:           {acc:.4f}")
    print(f"Precision (macro):  {prec:.4f}")
    print(f"Recall (macro):     {rec:.4f}")
    print(f"F1 Score (macro):   {f1:.4f}")

    # Classification report
    class_report = classification_report(
        y_true, y_pred,
        labels=list(range(len(NAMES))),
        target_names=NAMES,
        zero_division=0
    )

    print(f"\n{'=' * 70}")
    print("CLASSIFICATION REPORT")
    print(f"{'=' * 70}")
    print(class_report)

    # Confusion matrix
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(NAMES))))
    print(f"\n{'=' * 70}")
    print("CONFUSION MATRIX")
    print(f"{'=' * 70}")
    print(cm)

    # VISUALIZE CONFUSION MATRIX
    print("\n" + "=" * 70)
    print("STEP 11: VISUALIZING CONFUSION MATRIX")
    print("=" * 70)

    fig, ax = plt.subplots(figsize=(10, 8))
    im = ax.imshow(cm, interpolation='nearest', cmap=plt.cm.Blues)

    ax.figure.colorbar(im, ax=ax)
    ax.set(xticks=np.arange(cm.shape[1]),
           yticks=np.arange(cm.shape[0]),
           xticklabels=NAMES,
           yticklabels=NAMES,
           ylabel='True label',
           xlabel='Predicted label')

    plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")

    # Add text annotations
    thresh = cm.max() / 2.
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, format(cm[i, j], 'd'),
                    ha="center", va="center",
                    color="white" if cm[i, j] > thresh else "black")

    plt.title("Confusion Matrix - YOLOv8 Detection", fontsize=14, fontweight='bold')
    plt.tight_layout()

    cm_path = os.path.join(RESULTS_DIR, "confusion_matrix.png")
    plt.savefig(cm_path, dpi=300, bbox_inches='tight')
    print(f" Saved: {cm_path}")
    plt.close()

    # SAVE METRICS TO FILE
    print("\n" + "=" * 70)
    print("STEP 12: SAVING RESULTS")
    print("=" * 70)

    metrics_file = os.path.join(RESULTS_DIR, "metrics_summary.txt")
    with open(metrics_file, 'w') as f:
        f.write("=" * 70 + "\n")
        f.write("SOLARSENSE YOLOV8 - DETECTION MODEL RESULTS\n")
        f.write("=" * 70 + "\n\n")
        
        f.write("DATASET STATISTICS\n")
        f.write("-" * 70 + "\n")
        f.write(f"Total images processed: {len(image_paths)}\n")
        f.write(f"Classes: {len(NAMES)}\n")
        f.write(f"Class names: {', '.join(NAMES)}\n\n")
        
        f.write("TRAIN/VAL/TEST SPLIT\n")
        f.write("-" * 70 + "\n")
        train_count = len(glob.glob(os.path.join(DET_ROOT, "images", "train", "*.*")))
        val_count = len(glob.glob(os.path.join(DET_ROOT, "images", "val", "*.*")))
        test_count = len(glob.glob(os.path.join(DET_ROOT, "images", "test", "*.*")))
        f.write(f"Train: {train_count} images\n")
        f.write(f"Val: {val_count} images\n")
        f.write(f"Test: {test_count} images\n\n")
        
        f.write("PERFORMANCE METRICS\n")
        f.write("-" * 70 + "\n")
        f.write(f"Accuracy:           {acc:.4f}\n")
        f.write(f"Precision (macro):  {prec:.4f}\n")
        f.write(f"Recall (macro):     {rec:.4f}\n")
        f.write(f"F1 Score (macro):   {f1:.4f}\n")
        f.write(f"mAP50-95:          {metrics.box.map:.4f}\n")
        f.write(f"mAP50:             {metrics.box.map50:.4f}\n\n")
        
        f.write("CLASSIFICATION REPORT\n")
        f.write("-" * 70 + "\n")
        f.write(class_report)
        f.write("\n\nCONFUSION MATRIX\n")
        f.write("-" * 70 + "\n")
        f.write(str(cm))

    print(f" Saved: {metrics_file}")

    # FINAL SUMMARY
    print("\n" + "=" * 70)
    print("✓ ALL PROCESSING COMPLETE!")
    print("=" * 70)
    print(f"""
 RESULTS SAVED TO:
   {RESULTS_DIR}

 OUTPUT FILES:
   • predictions_visualization.png - Visual predictions on test images
   • confusion_matrix.png - Confusion matrix heatmap
   • metrics_summary.txt - Complete metrics report
   • solar_aug_full/ - Augmented dataset
   • solar_split_70_20_10/ - Train/Val/Test split
   • solar_det/ - YOLO detection dataset
   • runs/detect_train/ - Training logs and best model

 KEY METRICS:
   • Accuracy:  {acc:.4f}
   • Precision: {prec:.4f}
   • Recall:    {rec:.4f}
   • F1 Score:  {f1:.4f}

 Model saved: {best_model_path}
""")
    print("=" * 70)


if __name__ == '__main__':
    main()
