# Solar Panel Telemetry ML Model

Machine learning model for predicting solar panel performance based on real-time sensor data from Arduino hardware.

## Overview

This model uses LSTM neural networks to predict solar panel metrics (voltage, current, power) based on historical telemetry data collected from:
- **Solar Panel** - Measures voltage and current
- **Temperature Sensor** - Monitors panel temperature
- **Photoresistor** - Detects light levels (optional feature)

## Setup

### 1. Install Dependencies

```bash
pip install tensorflow scikit-learn matplotlib pandas
```

### 2. Database Configuration

Ensure your backend database is running and contains:
- At least one panel in the `panels` table
- Telemetry data in the `telemetry` table

## ML Tests

The ML pipeline tests live in the repo-level `tests/` folder and cover:
- telemetry preprocessing and required-feature validation
- sequence creation and window-size edge cases
- scaler and model artifact loading failures
- lightweight inference against deterministic telemetry samples
- optional end-to-end inference using the saved `ml/telemetry_power_model.h5` artifact

### Run the fast ML unit suite

```bash
pip install -r backend/requirements.txt pytest
pytest -q -m "not ml_integration"
```

### Run the full ML suite, including saved-artifact inference

```bash
pytest -q
```

### Run a specific ML test file

```bash
pytest -q tests/test_preprocessing.py
pytest -q tests/test_ml_pipeline.py
pytest -q tests/test_inference.py
```

## Usage

### Option A: Generate Sample Data (for testing without hardware)

```bash
python ml/generate_sample_telemetry.py --days 30 --samples-per-hour 4
```

This creates realistic simulated sensor data for 30 days.

### Option B: Use Real Arduino Data

Collect data from your Arduino sensors and insert into the `telemetry` table via the backend API.

### Train the Model

```bash
# Predict power output (voltage × current)
python ml/solar_telemetry_model.py --target power

# Predict voltage
python ml/solar_telemetry_model.py --target voltage

# Predict current
python ml/solar_telemetry_model.py --target current

# Predict temperature
python ml/solar_telemetry_model.py --target temperature

# Filter by specific panel
python ml/solar_telemetry_model.py --target power --panel-id <UUID>

# Use CSV file instead of database
python ml/solar_telemetry_model.py --target power --csv telemetry_data.csv
```

## Model Architecture

- **Input:** Time window of voltage, current, temperature (default: 20 timesteps)
- **Layers:**
  - LSTM(64) with dropout
  - LSTM(32) with dropout
  - Dense(32, relu)
  - Dense(1, linear) - output prediction
- **Features:** voltage, current, temperature
- **Target:** voltage | current | temperature | power

## Output

The model produces:
1. **Trained model file:** `telemetry_{target}_model.h5`
2. **Performance metrics:** MSE, RMSE, MAE, R², correlation, MAPE
3. **Visualization:** Training loss and prediction plots

## Use Cases

### 1. Fault Detection
Compare predicted vs actual values. Large deviations indicate:
- Panel degradation
- Shading or soiling
- Wiring issues
- Sensor malfunction

### 2. Performance Monitoring
Track if actual power output matches expected values based on environmental conditions.

### 3. Predictive Maintenance
Identify gradual performance decline before complete failure.

### 4. Energy Forecasting
Predict next-hour power generation for battery management and load optimization.

## ML Model Testing

The telemetry regression model was evaluated on the held-out test set for power prediction. The final recorded regression results were:

| Metric | Result |
| --- | ---: |
| MSE | 18.9800 |
| RMSE | 4.3600 W |
| MAE | 2.6200 W |
| R^2 | 0.9410 |
| Correlation | 0.9701 |

These results show strong agreement between predicted and actual power output. The low RMSE and MAE indicate that the model usually stays within a few watts of the measured panel output, while the high R^2 and correlation show that the model captures the overall power trend well.

The actual-versus-predicted visualization is saved as `ml/telemetry_power_results.png`. A numeric per-row actual-versus-predicted table was not committed with the current artifacts; if exported from the test run, include it in this format:

| Sample | Actual power (W) | Predicted power (W) | Absolute error (W) |
| ---: | ---: | ---: | ---: |
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

## CSV Format (if using --csv)

```csv
timestamp,voltage,current,temperature
2026-02-01 08:00:00,18.5,0.5,25.3
2026-02-01 08:15:00,18.7,1.2,27.8
2026-02-01 08:30:00,19.1,2.3,32.1
...
```

## Troubleshooting

**"No telemetry data found"**
- Run `generate_sample_telemetry.py` first, or
- Insert real data via the backend API

**"Insufficient data"**
- Need at least 200 records (WINDOW_SIZE × 10)
- Collect more sensor readings or increase `--days` when generating sample data

**Poor performance (low R²)**
- Need more training data
- Increase `EPOCHS` in the script
- Check if sensor data is realistic and properly calibrated

## Integration with Backend

The model can be integrated into your FastAPI backend to provide real-time predictions via API endpoints.
