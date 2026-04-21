import os
import sys
import glob
import random
import shutil
import cv2
import torch
import numpy as np
import yaml
import albumentations as A
import matplotlib
import matplotlib.pyplot as plt
from datetime import datetime
from tqdm import tqdm
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, classification_report, confusion_matrix
from ultralytics import YOLO
import warnings
warnings.filterwarnings('ignore')
matplotlib.use('Agg')


# 1- GPU INITIALIZATION 
print("GPU INITIALIZATION")
if torch.cuda.is_available():
    DEVICE = 'cuda'
    print(f" NVIDIA GPU (CUDA) ACTIVE: {torch.cuda.get_device_name(0)}")
elif torch.backends.mps.is_available():
    DEVICE = 'mps'
    print(" Apple Silicon GPU (MPS) ACTIVE")
else:
    DEVICE = 'cpu'
    print(" CPU mode - Training will be slow.")
print(f"Device: {DEVICE} | PyTorch: {torch.__version__}\n")


# 2- PATHS & CONFIG
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(SCRIPT_DIR, "Solar_panel_Images")
BASE_OUTPUT = os.path.join(SCRIPT_DIR, "YOLO_RESULTS")
RESULTS_DIR = os.path.join(BASE_OUTPUT, f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}")

os.makedirs(RESULTS_DIR, exist_ok=True)

OUT_AUG = os.path.join(RESULTS_DIR, "augmented_dataset")
DET_ROOT = os.path.join(RESULTS_DIR, "yolo_dataset")

# 3- UTILITY FUNCTIONS
def dhash_64(img_rgb, hash_size=8):
    g = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    g = cv2.resize(g, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
    diff = g[:, 1:] > g[:, :-1]
    h = 0
    for b in diff.flatten():
        h = (h << 1) | int(b)
    return h

def hamming_distance(h1, h2):
    return bin(h1 ^ h2).count('1')

def is_duplicate(h_new, hashes, threshold=5):
    return any(hamming_distance(h_new, h) <= threshold for h in hashes)

# 4- MAIN 
def main():
    if not os.path.exists(DATASET_PATH):
        print(f"ERROR: {DATASET_PATH} not found!")
        return

    # Get classes
    classes = sorted([d for d in os.listdir(DATASET_PATH) 
                     if os.path.isdir(os.path.join(DATASET_PATH, d)) 
                     and d != "Bird-drop" and not d.startswith('.')])
    
    print(f"Classes found: {classes}\n")

    # 1: ADVANCED DATA AUGMENTATION
    print("PHASE 1: DATA AUGMENTATION & DEDUPLICATION")
    
    # Production-grade augmentation pipeline
    aug_pipeline = A.Compose([
        # Strong geometric transformations
        A.RandomResizedCrop(size=(640, 640), scale=(0.8, 1.0), ratio=(0.9, 1.1), p=0.95), 
        A.Rotate(limit=30, border_mode=cv2.BORDER_REFLECT_101, p=0.7),
        A.Affine(scale=(0.85, 1.15), translate_percent=(-0.15, 0.15), shear=(-15, 15), p=0.6),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.3),
        
        # Photometric variations
        A.RandomBrightnessContrast(brightness_limit=0.4, contrast_limit=0.4, p=0.7),
        A.RandomGamma(gamma_limit=(60, 140), p=0.4),
        A.CLAHE(clip_limit=3.0, tile_grid_size=(8, 8), p=0.4),
        A.Equalize(p=0.2),
        
        # Robustness to noise
        A.GaussNoise(var_limit=(15, 60), p=0.3),
        A.ISONoise(p=0.2),
        A.GaussianBlur(blur_limit=(3, 7), p=0.2),
        A.MotionBlur(blur_limit=5, p=0.15),
        
        # Weather effects
        A.RandomRain(p=0.1),
        A.RandomFog(p=0.1),
        A.RandomSunFlare(p=0.05),
        
        # Color space variations
        A.HueSaturationValue(hue_shift_limit=10, sat_shift_limit=20, val_shift_limit=10, p=0.3),    ], p=1.0)

    IMG_SIZE = 640
    TARGET_PER_CLASS = 800
    DUP_THRESHOLD = 4

    for c in classes:
        src_dir = os.path.join(DATASET_PATH, c)
        dst_dir = os.path.join(OUT_AUG, c)
        os.makedirs(dst_dir, exist_ok=True)
        # Collect originals
        orig_images = []
        seen_hashes = set()
        
        img_files = sorted([f for f in glob.glob(os.path.join(src_dir, "*")) 
                           if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))])
        
        print(f"Class '{c}': Found {len(img_files)} images")

        for img_path in img_files:
            img = cv2.imread(img_path)
            if img is None:
                continue
            
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            if img_rgb.shape[:2] != (IMG_SIZE, IMG_SIZE):
                img_rgb = cv2.resize(img_rgb, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_CUBIC)
            
            h = dhash_64(img_rgb)
            
            # Skip duplicates
            if is_duplicate(h, seen_hashes, DUP_THRESHOLD):
                continue
            
            seen_hashes.add(h)
            orig_images.append(img_rgb)
            
            # Save original
            dst_path = os.path.join(dst_dir, os.path.basename(img_path))
            cv2.imwrite(dst_path, cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR))

        # Augment to target
        current = len(orig_images)
        needed = max(0, TARGET_PER_CLASS - current)
        print(f"  Original: {current} | Augmenting: {needed}")
        
        if needed > 0 and orig_images:
            for i in tqdm(range(needed), desc=f"Aug {c}", leave=False):
                img_rgb = random.choice(orig_images)
                aug_result = aug_pipeline(image=img_rgb)
                aug_img = aug_result['image']
                
                # Ensure uint8 for saving
                if aug_img.dtype != np.uint8:
                    if aug_img.max() <= 1.0:
                        aug_img = (aug_img * 255).astype(np.uint8)
                    else:
                        aug_img = np.clip(aug_img, 0, 255).astype(np.uint8)
                
                if aug_img.shape[:2] != (IMG_SIZE, IMG_SIZE):
                    aug_img = cv2.resize(aug_img, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_CUBIC)
                
                aug_path = os.path.join(dst_dir, f"{c}_aug_{i:06d}.jpg")
                cv2.imwrite(aug_path, cv2.cvtColor(aug_img, cv2.COLOR_RGB2BGR))
        
        final_count = len(glob.glob(os.path.join(dst_dir, '*')))
        print(f"Final: {final_count}\n")

    # 2:  TRAIN/VAL/TEST SPLIT
    print("PHASE 2: DATASET SPLIT (70% / 15% / 15%)")
    for split in ["train", "val", "test"]:
        os.makedirs(os.path.join(DET_ROOT, "images", split), exist_ok=True)
        os.makedirs(os.path.join(DET_ROOT, "labels", split), exist_ok=True)

    for idx, c in enumerate(classes):
        src_dir = os.path.join(OUT_AUG, c)
        img_files = sorted(glob.glob(os.path.join(src_dir, "*.jpg")))
        
        # Stratified split
        train_val, test_set = train_test_split(img_files, test_size=0.15, random_state=42, shuffle=True)
        train_set, val_set = train_test_split(train_val, test_size=0.176, random_state=42, shuffle=True)
        
        splits = {"train": train_set, "val": val_set, "test": test_set}
        
        for split, files in splits.items():
            for img_path in files:
                basename = os.path.basename(img_path)
                dst_img = os.path.join(DET_ROOT, "images", split, f"{c}_{basename}")
                dst_lbl = os.path.join(DET_ROOT, "labels", split, f"{c}_{basename.replace('.jpg', '.txt')}")
                
                shutil.copy2(img_path, dst_img)
                
                # YOLO format: class center_x center_y width height (normalized)
                with open(dst_lbl, 'w') as f:
                    f.write(f"{idx} 0.5 0.5 1.0 1.0")
        
        print(f"  {c}: train={len(train_set)} | val={len(val_set)} | test={len(test_set)}")
        # 3: YOLO CONFIG
    data_cfg = {
        "path": DET_ROOT,
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "nc": len(classes),
        "names": {i: name for i, name in enumerate(classes)}
    }
    
    yaml_path = os.path.join(DET_ROOT, "data.yaml")
    with open(yaml_path, "w") as f:
        yaml.dump(data_cfg, f, sort_keys=False)
    
    print(f"\n Config: {yaml_path}\n")

    # 4: YOLOV8  model 
    print(f"PHASE 4: YOLOV8-LARGE TRAINING ON {DEVICE.upper()}")
    model = YOLO("yolov8l.pt")  
    results = model.train(
        data=yaml_path,
        epochs=100,  
        imgsz=640,
        batch=6,  
        device=DEVICE,
        workers=0,
        patience=30, 
        amp=False,
        project=RESULTS_DIR,
        name="solar_detection",
        save=True,
        verbose=True,
        
        # optimization
        optimizer='SGD',
        lr0=0.01,
        lrf=0.001,
        momentum=0.937,
        weight_decay=0.0005,
        warmup_epochs=10,
        warmup_momentum=0.8,
        
        # Data augmentation intensity
        hsv_h=0.02,
        hsv_s=0.75,
        hsv_v=0.4,
        degrees=25,
        translate=0.15,
        scale=0.7,
        flipud=0.5,
        fliplr=0.5,
        mosaic=1.0,
        mixup=0.2,
        
    )

    # 5: EVALUATION & METRICS
    print("PHASE 5: EVALUATION")
    best_model_path = os.path.join(RESULTS_DIR, "solar_detection", "weights", "best.pt")
    best_model = YOLO(best_model_path)

    # Validation metrics
    val_results = best_model.val(data=yaml_path, split="val", device=DEVICE)
    test_results = best_model.val(data=yaml_path, split="test", device=DEVICE)

    print(f"\nValidation mAP50-95: {val_results.box.map:.4f}")
    print(f"Test mAP50-95: {test_results.box.map:.4f}")

    # 6: VISUALIZATION
    print("PHASE 6: PREDICTIONS VISUALIZATION")
    test_dir = os.path.join(DET_ROOT, "images", "test")
    test_imgs = sorted(glob.glob(os.path.join(test_dir, "*.jpg")))
    sample = random.sample(test_imgs, min(12, len(test_imgs)))

    fig, axes = plt.subplots(3, 4, figsize=(20, 12))
    axes = axes.flatten()

    for idx, img_path in enumerate(sample):
        result = best_model.predict(img_path, conf=0.3, verbose=False, device=DEVICE)[0]
        img_bgr = result.plot()
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        
        axes[idx].imshow(img_rgb)
        axes[idx].set_title(os.path.basename(img_path)[:25], fontsize=9)
        axes[idx].axis('off')

    plt.tight_layout()
    viz_path = os.path.join(RESULTS_DIR, "predictions.png")
    plt.savefig(viz_path, dpi=200, bbox_inches='tight')
    print(f" Saved: {viz_path}")
    plt.close()

    # SUMMARY
    print("TRAINING COMPLETE!")
    print(f"\nResults: {RESULTS_DIR}")
    print(f"Best model: {best_model_path}")
    print(f"mAP50-95 (Val): {val_results.box.map:.4f}")
    print(f"mAP50-95 (Test): {test_results.box.map:.4f}")

if __name__ == "__main__":
    main()  