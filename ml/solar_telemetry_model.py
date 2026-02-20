"""
Solar Panel Telemetry Prediction Model
Predicts future voltage/current/temperature based on historical sensor readings
"""

import argparse
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.preprocessing import StandardScaler
import joblib
from tensorflow.keras import models, layers
import sys

warnings.filterwarnings("ignore")

# Add backend to path for database access
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

WINDOW_SIZE = 20  # Number of past timesteps to use for prediction
EPOCHS = 50  # Training epochs
BATCH_SIZE = 32

scaler = StandardScaler()


def load_telemetry_from_db(panel_id=None):
    """Load telemetry data from PostgreSQL database."""
    from app.db.database import SessionLocal
    from app.models.telemetry import Telemetry
    
    db = SessionLocal()
    try:
        query = db.query(Telemetry).order_by(Telemetry.timestamp)
        if panel_id:
            query = query.filter(Telemetry.panel_id == panel_id)
        
        results = query.all()
        
        if not results:
            raise ValueError("No telemetry data found in database. Please add data first.")
        
        data = []
        for record in results:
            data.append({
                'timestamp': record.timestamp,
                'voltage': record.voltage,
                'current': record.current,
                'temperature': record.temperature,
                'power': record.voltage * record.current  # Calculate power
            })
        
        df = pd.DataFrame(data)
        print(f"Loaded {len(df)} telemetry records from database")
        return df
    
    finally:
        db.close()


def create_sequences(df, feature_cols, target_col, window_size=20):
    """Create windowed sequences for LSTM training."""
    data = scaler.fit_transform(df[feature_cols].to_numpy())
    labels = df[target_col].to_numpy()
    
    X = []
    y = []
    
    for i in range(len(data) - window_size):
        X.append(data[i:i + window_size])
        y.append(labels[i + window_size])
    
    return np.array(X), np.array(y)


def create_sequences_transform(df, feature_cols, target_col, window_size=20):
    """Create windowed sequences using pre-fitted scaler (for validation/test)."""
    data = scaler.transform(df[feature_cols].to_numpy())
    labels = df[target_col].to_numpy()
    
    X = []
    y = []
    
    for i in range(len(data) - window_size):
        X.append(data[i:i + window_size])
        y.append(labels[i + window_size])
    
    return np.array(X), np.array(y)


def build_model(input_shape, output_units=1):
    """Build LSTM model for time series prediction."""
    model = models.Sequential([
        layers.LSTM(64, return_sequences=True, input_shape=input_shape),
        layers.Dropout(0.2),
        layers.LSTM(32, return_sequences=False),
        layers.Dropout(0.2),
        layers.Dense(32, activation='relu'),
        layers.Dense(output_units, activation='linear')
    ])
    return model


def main():
    parser = argparse.ArgumentParser(description="Train LSTM on solar telemetry data")
    parser.add_argument('--panel-id', type=str, default=None, help='Panel ID to filter data')
    parser.add_argument('--target', type=str, default='power', 
                       choices=['voltage', 'current', 'temperature', 'power'],
                       help='Target variable to predict')
    parser.add_argument('--csv', type=str, default=None, 
                       help='Use CSV file instead of database')
    parser.add_argument('--save-scalers-only', action='store_true', 
                       help='Fit and save feature/target scalers without training the model')
    args = parser.parse_args()
    
    print("="*60)
    print("SOLAR PANEL TELEMETRY PREDICTION MODEL")
    print("="*60)
    
    # Load data
    if args.csv:
        print(f"\nLoading data from CSV: {args.csv}")
        df = pd.read_csv(args.csv)
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'])
        # Calculate power if not present
        if 'power' not in df.columns and 'voltage' in df.columns and 'current' in df.columns:
            df['power'] = df['voltage'] * df['current']
    else:
        print("\nLoading data from database...")
        df = load_telemetry_from_db(args.panel_id)
    
    # Sort by timestamp
    df = df.sort_values('timestamp').reset_index(drop=True)
    
    # Feature engineering
    feature_cols = ['voltage', 'current', 'temperature']
    target_col = args.target
    
    if target_col not in df.columns:
        raise ValueError(f"Target column '{target_col}' not found in data")
    
    print(f"\nData shape: {df.shape}")
    print(f"Features: {feature_cols}")
    print(f"Target: {target_col}")
    print(f"\nData statistics:")
    print(df[feature_cols + [target_col]].describe())

    if args.save_scalers_only:
        # Fit and save feature + target scalers (no model training)
        scaler.fit(df[feature_cols].to_numpy())
        scaler_y = StandardScaler()
        scaler_y.fit(df[target_col].to_numpy().reshape(-1, 1))
        scalers_dir = Path(__file__).parent
        joblib.dump(scaler, scalers_dir / f"telemetry_scaler_X.joblib")
        joblib.dump(scaler_y, scalers_dir / f"telemetry_scaler_y.joblib")
        print(f"Scalers saved to: {scalers_dir / 'telemetry_scaler_X.joblib'} and {scalers_dir / 'telemetry_scaler_y.joblib'}")
        return
    
    # Check for minimum data requirement
    min_samples = WINDOW_SIZE * 10  # Need at least 10 windows
    if len(df) < min_samples:
        raise ValueError(f"Insufficient data. Need at least {min_samples} records, got {len(df)}. "
                        f"Please collect more telemetry data from your Arduino/sensors.")
    
    # Split data: 80% train, 10% val, 10% test
    train_idx = int(0.8 * len(df))
    val_idx = int(0.9 * len(df))
    
    df_train = df[:train_idx]
    df_val = df[train_idx:val_idx]
    df_test = df[val_idx:]
    
    print(f"\nTrain: {len(df_train)} | Val: {len(df_val)} | Test: {len(df_test)}")
    
    # Create sequences
    X_train, y_train = create_sequences(df_train, feature_cols, target_col, WINDOW_SIZE)
    X_val, y_val = create_sequences_transform(df_val, feature_cols, target_col, WINDOW_SIZE)
    X_test, y_test = create_sequences_transform(df_test, feature_cols, target_col, WINDOW_SIZE)
    
    print(f"\nSequence shapes: X_train={X_train.shape}, y_train={y_train.shape}")
    
    # Fit target scaler on training labels and save both scalers for production
    scaler_y = StandardScaler()
    scaler_y.fit(y_train.reshape(-1, 1))
    scalers_dir = Path(__file__).parent
    joblib.dump(scaler, scalers_dir / f"telemetry_scaler_X.joblib")
    joblib.dump(scaler_y, scalers_dir / f"telemetry_scaler_y.joblib")
    print(f"Training-time scalers saved to: {scalers_dir / 'telemetry_scaler_X.joblib'} and {scalers_dir / 'telemetry_scaler_y.joblib'}")
    
    # Build and compile model
    model = build_model(input_shape=(WINDOW_SIZE, len(feature_cols)))
    model.compile(optimizer='adam', loss='mse', metrics=['mae'])
    
    print("\nModel Architecture:")
    model.summary()
    
    # Train
    print(f"\nTraining for {EPOCHS} epochs...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        verbose=1
    )
    
    # Evaluate
    print("\n" + "="*60)
    print("EVALUATION RESULTS")
    print("="*60)
    
    y_pred = model.predict(X_test, verbose=0)
    
    mse = mean_squared_error(y_test, y_pred)
    rmse = np.sqrt(mse)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    corr = np.corrcoef(y_test.flatten(), y_pred.flatten())[0, 1]
    mape = np.mean(np.abs((y_test - y_pred) / (np.abs(y_test) + 1e-8))) * 100
    
    print(f"\nPredicting: {target_col}")
    print(f"{'Metric':<30} {'Value':>15}")
    print("-" * 50)
    print(f"{'Mean Squared Error (MSE)':<30} {mse:>15.4f}")
    print(f"{'Root Mean Squared Error (RMSE)':<30} {rmse:>15.4f}")
    print(f"{'Mean Absolute Error (MAE)':<30} {mae:>15.4f}")
    print(f"{'R² Score':<30} {r2:>15.4f}")
    print(f"{'Correlation':<30} {corr:>15.4f}")
    print(f"{'MAPE (%)':<30} {mape:>15.2f}")
    print("="*60)
    
    # Save model
    model_path = Path(__file__).parent / f"telemetry_{target_col}_model.h5"
    model.save(model_path)
    print(f"\nModel saved to: {model_path}")
    
    # Plot results
    plt.figure(figsize=(15, 5))
    
    # Plot 1: Training history
    plt.subplot(1, 2, 1)
    plt.plot(history.history['loss'], label='Train Loss')
    plt.plot(history.history['val_loss'], label='Val Loss')
    plt.title('Model Loss During Training')
    plt.xlabel('Epoch')
    plt.ylabel('Loss (MSE)')
    plt.legend()
    plt.grid(True)
    
    # Plot 2: Predictions vs Actual
    plt.subplot(1, 2, 2)
    plt.plot(y_test[:200], label='Actual', alpha=0.7)
    plt.plot(y_pred[:200], label='Predicted', alpha=0.7)
    plt.title(f'Predictions vs Actual ({target_col})')
    plt.xlabel('Time Step')
    plt.ylabel(target_col.capitalize())
    plt.legend()
    plt.grid(True)
    
    plt.tight_layout()
    plt.savefig(Path(__file__).parent / f'telemetry_{target_col}_results.png')
    print(f"Plot saved to: telemetry_{target_col}_results.png")
    plt.show()
    
    # Example prediction
    print(f"\n{'='*60}")
    print("EXAMPLE PREDICTION")
    print("="*60)
    last_window = X_test[-1:]
    next_pred = model.predict(last_window, verbose=0)[0][0]
    print(f"Predicted next {target_col}: {next_pred:.2f}")
    print(f"Actual next {target_col}: {y_test[-1]:.2f}")
    print(f"Error: {abs(next_pred - y_test[-1]):.2f}")


if __name__ == "__main__":
    main()
