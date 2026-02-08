"""
ML Model Service for Real-time Telemetry Analysis
Handles model loading, predictions, and anomaly detection
"""

import numpy as np
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from tensorflow import keras
from sklearn.preprocessing import StandardScaler
import logging

logger = logging.getLogger(__name__)

class TelemetryModelService:
    """Service for loading and using the trained telemetry prediction model"""
    
    def __init__(self):
        self.model = None
        self.scaler_X = StandardScaler()
        self.scaler_y = StandardScaler()
        self.sequence_length = 20
        self.is_fitted = False
        self._load_model()
    
    def _load_model(self):
        """Load the trained LSTM model"""
        model_path = Path(__file__).parent.parent.parent.parent / "ml" / "telemetry_power_model.h5"
        
        if not model_path.exists():
            logger.warning(f"Model not found at {model_path}. Predictions will not be available.")
            return
        
        try:
            self.model = keras.models.load_model(str(model_path), compile=False)
            logger.info(f"Model loaded successfully from {model_path}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self.model = None
    
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
        predictions = self.scaler_y.inverse_transform(predictions_scaled)
        
        # Calculate actual power and errors
        results = []
        for i, pred in enumerate(predictions):
            idx = i + self.sequence_length
            actual_power = telemetry_data[idx]['voltage'] * telemetry_data[idx]['current']
            predicted_power = float(pred[0])
            error = abs(actual_power - predicted_power)
            error_percent = (error / (actual_power + 1e-8)) * 100
            
            results.append({
                'timestamp': telemetry_data[idx].get('timestamp'),
                'actual_power': round(actual_power, 2),
                'predicted_power': round(predicted_power, 2),
                'error': round(error, 2),
                'error_percent': round(error_percent, 2),
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
        prediction = self.scaler_y.inverse_transform(prediction_scaled)
        
        return {
            'predicted_power': round(float(prediction[0][0]), 2),
            'based_on_records': self.sequence_length,
            'latest_timestamp': recent[-1].get('timestamp')
        }
    
    def get_model_info(self) -> Dict:
        """Get information about the loaded model"""
        return {
            'model_loaded': self.model is not None,
            'scalers_fitted': self.is_fitted,
            'sequence_length': self.sequence_length,
            'model_path': str(Path(__file__).parent.parent.parent.parent / "ml" / "telemetry_power_model.h5")
        }


# Singleton instance
model_service = TelemetryModelService()
