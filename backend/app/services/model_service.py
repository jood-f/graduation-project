"""
ML Model Service for Real-time Telemetry Analysis
Handles model loading, predictions, and anomaly detection.
"""

import logging
import os
from pathlib import Path
from typing import Dict, List, Optional

import joblib
import numpy as np
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

# Relative error is not meaningful when actual power is near zero.
MIN_ACTUAL_POWER_FOR_PERCENT = 1.0

class TelemetryModelService:
    """Service for loading and using the trained telemetry prediction model"""

    def __init__(self):
        self.model = None
        self.scaler_X = StandardScaler()
        self.scaler_y = StandardScaler()
        self.sequence_length = 20
        self.is_fitted = False
        self.model_path: Optional[str] = None
        self.scaler_x_path: Optional[str] = None
        self.scaler_y_path: Optional[str] = None
        self.unavailable_reason: Optional[str] = None
        self.model_search_paths: list[str] = []
        self.scaler_search_paths: list[str] = []
        self._load_model()
        # Load training-time scalers if they exist
        self._load_scalers()

    def _repo_root(self) -> Path:
        return Path(__file__).resolve().parents[3]

    def _candidate_model_paths(self) -> list[Path]:
        candidates: list[Path] = []

        env_model_path = os.getenv("ML_MODEL_PATH")
        if env_model_path:
            candidates.append(Path(env_model_path))

        repo_root = self._repo_root()
        candidates.extend(
            [
                repo_root / "ml" / "telemetry_power_model.h5",
                repo_root / "backend" / "ml" / "telemetry_power_model.h5",
                Path.cwd() / "ml" / "telemetry_power_model.h5",
                Path.cwd() / "backend" / "ml" / "telemetry_power_model.h5",
            ]
        )

        unique: list[Path] = []
        for path in candidates:
            if path not in unique:
                unique.append(path)
        return unique

    def _candidate_scaler_paths(self) -> list[tuple[Path, Path]]:
        candidates: list[tuple[Path, Path]] = []

        env_scaler_x_path = os.getenv("ML_SCALER_X_PATH")
        env_scaler_y_path = os.getenv("ML_SCALER_Y_PATH")
        env_scaler_dir = os.getenv("ML_SCALER_DIR")

        if env_scaler_x_path and env_scaler_y_path:
            candidates.append((Path(env_scaler_x_path), Path(env_scaler_y_path)))

        if env_scaler_dir:
            scaler_dir = Path(env_scaler_dir)
            candidates.append(
                (
                    scaler_dir / "telemetry_scaler_X.joblib",
                    scaler_dir / "telemetry_scaler_y.joblib",
                )
            )

        repo_root = self._repo_root()
        for scaler_dir in [
            repo_root / "ml",
            repo_root / "backend" / "ml",
            Path.cwd() / "ml",
            Path.cwd() / "backend" / "ml",
            Path(__file__).resolve().parents[2] / "ml",
        ]:
            candidates.append(
                (
                    scaler_dir / "telemetry_scaler_X.joblib",
                    scaler_dir / "telemetry_scaler_y.joblib",
                )
            )

        unique: list[tuple[Path, Path]] = []
        for x_path, y_path in candidates:
            pair = (x_path, y_path)
            if pair not in unique:
                unique.append(pair)
        return unique

    def _load_model(self):
        """Load the trained LSTM model"""
        candidates = self._candidate_model_paths()
        self.model_search_paths = [str(path) for path in candidates]

        model_path = next((path for path in candidates if path.exists()), None)
        if model_path is None:
            self.unavailable_reason = (
                "Telemetry model file not found. "
                "Set ML_MODEL_PATH or deploy ml/telemetry_power_model.h5."
            )
            logger.warning(
                "%s Searched: %s",
                self.unavailable_reason,
                ", ".join(self.model_search_paths),
            )
            return

        try:
            from tensorflow import keras
        except Exception as e:
            self.unavailable_reason = (
                "TensorFlow is not installed, so the telemetry model cannot load. "
                "Install tensorflow-cpu in the backend environment."
            )
            logger.error("%s Import error: %s", self.unavailable_reason, e)
            return

        try:
            self.model_path = str(model_path)
            self.model = keras.models.load_model(str(model_path), compile=False)
            logger.info(f"Model loaded successfully from {model_path}")
            self.unavailable_reason = None
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self.unavailable_reason = f"Telemetry model load failed: {e}"
            self.model = None

    def _load_scalers(self):
        """Load scalers saved during training if available."""
        candidates = self._candidate_scaler_paths()
        self.scaler_search_paths = [
            f"{x_path} | {y_path}" for x_path, y_path in candidates
        ]
        x_path = None
        y_path = None
        for candidate_x_path, candidate_y_path in candidates:
            logger.debug(
                "Checking scaler candidate paths: %s and %s",
                candidate_x_path,
                candidate_y_path,
            )
            if candidate_x_path.exists() and candidate_y_path.exists():
                x_path = candidate_x_path
                y_path = candidate_y_path
                logger.info(f"Found telemetry scalers at {x_path} and {y_path}")
                break

        if x_path is None or y_path is None:
            logger.info(
                "No telemetry scaler files found. Searched: %s",
                "; ".join(self.scaler_search_paths),
            )
            return

        try:
            self.scaler_X = joblib.load(str(x_path))
            self.scaler_y = joblib.load(str(y_path))
            self.is_fitted = True
            self.scaler_x_path = str(x_path)
            self.scaler_y_path = str(y_path)
            logger.info(f"Loaded telemetry scalers from {x_path} and {y_path}")
        except Exception as e:
            logger.warning(f"Failed to load telemetry scalers: {e}")
    
    def fit_scalers(self, telemetry_data: List[Dict]):
        """Fit scalers on historical data"""
        if len(telemetry_data) < 100:
            logger.warning("Insufficient data to fit scalers. Need at least 100 records.")
            return False
        
        features = np.array([
            [d['voltage'], d['current'], d['temperature']] 
            for d in telemetry_data
        ])
        power = np.array([[d['voltage'] * d['current']] for d in telemetry_data])
        
        self.scaler_X.fit(features)
        self.scaler_y.fit(power)
        self.is_fitted = True
        logger.info(f"Scalers fitted on {len(telemetry_data)} records")
        return True
    
    def create_sequences(self, telemetry_data: List[Dict]) -> Optional[np.ndarray]:
        """Create sequences from telemetry data for LSTM input"""
        if not self.is_fitted:
            raise ValueError("Scalers not fitted. Call fit_scalers first.")
        
        if len(telemetry_data) < self.sequence_length:
            logger.warning(f"Insufficient data for sequence. Need at least {self.sequence_length} records.")
            return None
        
        # Extract features and scale
        features = np.array([
            [d['voltage'], d['current'], d['temperature']] 
            for d in telemetry_data
        ])
        scaled_features = self.scaler_X.transform(features)
        
        # Create sequences
        sequences = []
        for i in range(len(scaled_features) - self.sequence_length):
            sequences.append(scaled_features[i:i + self.sequence_length])
        
        return np.array(sequences) if sequences else None
    
    def predict_power(self, telemetry_data: List[Dict]) -> Optional[List[Dict]]:
        """
        Predict power output from telemetry sequences
        
        Args:
            telemetry_data: List of telemetry records with voltage, current, temperature
        
        Returns:
            List of predictions with actual vs predicted power, timestamps, errors
        """
        if self.model is None:
            logger.error("Model not loaded. Cannot make predictions.")
            return None
        
        if not self.is_fitted:
            if not self.fit_scalers(telemetry_data):
                return None
        
        sequences = self.create_sequences(telemetry_data)
        if sequences is None:
            return None
        
        # Make predictions
        predictions_scaled = self.model.predict(sequences, verbose=0)
        # Accept models that either predict scaled targets (z-scores) or raw power.
        preds_arr = np.asarray(predictions_scaled).reshape(-1, 1)
        if hasattr(self.scaler_y, 'scale_') and np.nanmax(np.abs(preds_arr)) < 50:
            # small-magnitude outputs look like scaled values -> inverse transform
            predictions = self.scaler_y.inverse_transform(preds_arr)
        else:
            # large-magnitude outputs look like raw power -> use as-is
            predictions = preds_arr

        # Calculate actual power and errors
        results = []
        for i, pred in enumerate(predictions):
            idx = i + self.sequence_length
            actual_power = telemetry_data[idx]['voltage'] * telemetry_data[idx]['current']
            predicted_power = max(float(pred[0]), 0.0)
            error = abs(actual_power - predicted_power)
            if abs(actual_power) < MIN_ACTUAL_POWER_FOR_PERCENT:
                error_percent = None
            else:
                error_percent = (error / abs(actual_power)) * 100
            
            results.append({
                'timestamp': telemetry_data[idx].get('timestamp'),
                'actual_power': round(actual_power, 2),
                'predicted_power': round(predicted_power, 2),
                'error': round(error, 2),
                'error_percent': round(error_percent, 2) if error_percent is not None else None,
                'voltage': telemetry_data[idx]['voltage'],
                'current': telemetry_data[idx]['current'],
                'temperature': telemetry_data[idx]['temperature']
            })
        
        return results
    
    def detect_anomalies(self, telemetry_data: List[Dict], threshold: float = 5.0) -> List[Dict]:
        """
        Detect anomalies in telemetry data based on prediction errors
        
        Args:
            telemetry_data: List of telemetry records
            threshold: Error threshold in watts for anomaly detection
        
        Returns:
            List of detected anomalies with details
        """
        predictions = self.predict_power(telemetry_data)
        if predictions is None:
            return []
        
        anomalies = []
        for pred in predictions:
            if pred['error'] > threshold:
                anomalies.append({
                    'timestamp': pred['timestamp'],
                    'severity': 'high' if pred['error'] > threshold * 2 else 'medium',
                    'error': pred['error'],
                    'error_percent': pred['error_percent'],
                    'actual_power': pred['actual_power'],
                    'predicted_power': pred['predicted_power'],
                    'details': {
                        'voltage': pred['voltage'],
                        'current': pred['current'],
                        'temperature': pred['temperature']
                    }
                })
        
        return anomalies
    
    def predict_next(self, recent_telemetry: List[Dict]) -> Optional[Dict]:
        """
        Predict next power output based on recent telemetry
        
        Args:
            recent_telemetry: Last N telemetry records (at least sequence_length)
        
        Returns:
            Predicted power for next timestep
        """
        if self.model is None:
            return None
        
        if len(recent_telemetry) < self.sequence_length:
            logger.warning(f"Need at least {self.sequence_length} recent records for prediction")
            return None
        
        if not self.is_fitted:
            if not self.fit_scalers(recent_telemetry):
                return None
        
        # Take last sequence_length records
        recent = recent_telemetry[-self.sequence_length:]
        
        # Extract and scale features
        features = np.array([
            [d['voltage'], d['current'], d['temperature']] 
            for d in recent
        ])
        scaled = self.scaler_X.transform(features)
        
        # Create sequence and predict
        sequence = scaled.reshape(1, self.sequence_length, 3)
        prediction_scaled = self.model.predict(sequence, verbose=0)
        pred_arr = np.asarray(prediction_scaled).reshape(-1, 1)
        if hasattr(self.scaler_y, 'scale_') and np.nanmax(np.abs(pred_arr)) < 50:
            prediction = self.scaler_y.inverse_transform(pred_arr)
        else:
            prediction = pred_arr

        predicted_power = max(float(prediction[0][0]), 0.0)

        return {
            'predicted_power': round(predicted_power, 2),
            'based_on_records': self.sequence_length,
            'latest_timestamp': recent[-1].get('timestamp')
        }
    
    def get_model_info(self) -> Dict:
        """Get information about the loaded model"""
        return {
            'model_loaded': self.model is not None,
            'scalers_fitted': self.is_fitted,
            'sequence_length': self.sequence_length,
            'model_path': self.model_path,
            'scaler_x_path': self.scaler_x_path,
            'scaler_y_path': self.scaler_y_path,
            'reason': self.unavailable_reason,
            'searched_model_paths': self.model_search_paths,
            'searched_scaler_paths': self.scaler_search_paths,
        }


# Singleton instance
model_service = TelemetryModelService()
