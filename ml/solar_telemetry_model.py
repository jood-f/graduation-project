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
from sklearn.model_selection import TimeSeriesSplit  

warnings.filterwarnings("ignore")

# This training script lives outside the FastAPI app, but it still reuses the
# backend's database models and Supabase fallback service to avoid duplicate DB code.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

# Each training sample is built from the previous WINDOW_SIZE telemetry readings.
# With 20 readings, the LSTM sees enough recent behavior to learn trends without
# making every prediction depend on too much old history.
WINDOW_SIZE = 20

# These are intentionally modest so the model can be retrained on a laptop during
# development. Increase them only when the dataset is larger and validation improves.
EPOCHS = 50
BATCH_SIZE = 32

scaler = StandardScaler()


def load_telemetry_from_db(panel_id=None):
    """Load telemetry data from PostgreSQL database."""
    from app.db.database import SessionLocal
    from app.models.telemetry import Telemetry
    from app.services.supabase_telemetry_service import (
        SupabaseTelemetryError,
        supabase_telemetry_service,
    )
    
    db = SessionLocal() if SessionLocal is not None else None
    try:
        try:
            # Prefer direct SQL because it is faster and returns Python datetime
            # objects already. If that fails, the REST fallback below keeps the
            # training script usable in environments where Postgres is blocked.
            if db is None:
                raise RuntimeError("Direct database session is unavailable")
            query = db.query(Telemetry).order_by(Telemetry.timestamp)
            if panel_id:
                query = query.filter(Telemetry.panel_id == panel_id)

            results = query.all()

            data = []
            for record in results:
                data.append({
                    'timestamp': record.timestamp,
                    'voltage': record.voltage,
                    'current': record.current,
                    'temperature': record.temperature,
                    'power': record.voltage * record.current  # Calculate power
                })

            if data:
                df = pd.DataFrame(data)
                print(f"Loaded {len(df)} telemetry records from database")
                return df
        except Exception as exc:
            if db is not None:
                db.rollback()
            print(f"Direct database read failed, trying Supabase REST fallback: {exc}")

        try:
            rows = supabase_telemetry_service.list_telemetry(
                panel_id=panel_id,
                ascending=True,
            )
        except SupabaseTelemetryError as exc:
            raise ValueError(
                "No telemetry data could be loaded from either direct database access "
                f"or Supabase REST fallback: {exc}"
            ) from exc

        if not rows:
            raise ValueError("No telemetry data found in database. Please add data first.")

        data = []
        for record in rows:
            # Supabase REST can return partial rows if columns are missing or data
            # was inserted by an older client, so skip anything the model cannot use.
            voltage = record.get("voltage")
            current = record.get("current")
            temperature = record.get("temperature")
            timestamp = record.get("timestamp")

            if (
                timestamp is None
                or voltage is None
                or current is None
                or temperature is None
            ):
                continue

            data.append({
                'timestamp': pd.to_datetime(timestamp),
                'voltage': float(voltage),
                'current': float(current),
                'temperature': float(temperature),
                'power': float(voltage) * float(current),
            })

        if not data:
            raise ValueError("No usable telemetry rows were returned from Supabase.")

        df = pd.DataFrame(data)
        print(f"Loaded {len(df)} telemetry records from Supabase REST fallback")
        return df
    
    finally:
        if db is not None:
            db.close()


def create_sequences(df, feature_cols, target_col, window_size=20):
    """Create windowed sequences for LSTM training."""
    # Fit the feature scaler only on the training split. Validation and test data
    # must use this same scaler so their statistics do not leak into training.
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
    # Reuse the training scaler here. This mirrors production inference, where the
    # backend loads telemetry_scaler_X.joblib and transforms live readings with it.
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
    # Two LSTM layers let the network learn short-term sensor movement first, then
    # compress that history into a prediction for the next voltage/current/temp/power.
    model = models.Sequential([
        layers.LSTM(64, return_sequences=True, input_shape=input_shape),
        layers.Dropout(0.2),
        layers.LSTM(32, return_sequences=False),
        layers.Dropout(0.2),
        layers.Dense(32, activation='relu'),
        layers.Dense(output_units, activation='linear')
    ])
    return model


def cross_validate_model(df, feature_cols, target_col, window_size):
    """Run chronological cross-validation so future readings never train the past."""
    print("\n" + "="*60)
    print("TIME SERIES CROSS VALIDATION")
    print("="*60)

    # TimeSeriesSplit keeps the order of telemetry intact. A random split would look
    # better on paper, but it would let tomorrow's behavior influence yesterday's model.
    tscv = TimeSeriesSplit(n_splits=5)
    scores = []
    fold = 1

    for train_idx, test_idx in tscv.split(df):
        print(f"\nFold {fold}/5")

        df_train = df.iloc[train_idx]
        df_test = df.iloc[test_idx]

        scaler_fold = StandardScaler()
        train_scaled = scaler_fold.fit_transform(df_train[feature_cols].to_numpy())
        test_scaled = scaler_fold.transform(df_test[feature_cols].to_numpy())

        def make_seq(data, labels):
            # Build the same rolling windows used by the final model, but with a
            # fold-specific scaler so each validation fold stays honest.
            X, y = [], []
            for i in range(len(data) - window_size):
                X.append(data[i:i+window_size])
                y.append(labels[i+window_size])
            return np.array(X), np.array(y)

        X_train, y_train = make_seq(train_scaled, df_train[target_col].to_numpy())
        X_test, y_test = make_seq(test_scaled, df_test[target_col].to_numpy())

        if len(X_train) == 0 or len(X_test) == 0:
            print("Skipping fold (not enough data)")
            continue

        model = build_model((window_size, len(feature_cols)))
        model.compile(optimizer='adam', loss='mse')

        model.fit(X_train, y_train, epochs=10, batch_size=32, verbose=0)

        y_pred = model.predict(X_test, verbose=0)

        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        print(f"RMSE: {rmse:.4f}")

        scores.append(rmse)
        fold += 1

    print("\n" + "="*60)
    print(f"CV Mean RMSE: {np.mean(scores):.4f}")
    print(f"CV Std RMSE: {np.std(scores):.4f}")
    print("="*60)


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

    # Cross-validation gives a quick sanity check before training the final model.
    # It is especially useful when sensor data is noisy or comes from one panel only.
    cross_validate_model(df, feature_cols, target_col, WINDOW_SIZE)

    if args.save_scalers_only:
        # Sometimes the backend only needs refreshed scalers for inference. This path
        # updates scaler artifacts without replacing the existing trained model.
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
    
    # Create model-ready windows after splitting by time. This keeps the final test
    # period as unseen future data instead of mixing it into earlier windows.
    X_train, y_train = create_sequences(df_train, feature_cols, target_col, WINDOW_SIZE)
    X_val, y_val = create_sequences_transform(df_val, feature_cols, target_col, WINDOW_SIZE)
    X_test, y_test = create_sequences_transform(df_test, feature_cols, target_col, WINDOW_SIZE)
    
    print(f"\nSequence shapes: X_train={X_train.shape}, y_train={y_train.shape}")
    
    # Save both scalers beside the model because the backend inference service needs
    # the exact same transformations that were used during training.
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
    
    # Save a visual check for the report: the loss curve shows training behavior,
    # and the prediction plot shows whether the model follows the test trend.
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
    
    # One concrete final prediction makes the trained model easy to sanity-check
    # without opening the plot or reading the full metric table.
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
