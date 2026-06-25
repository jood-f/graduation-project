#!/usr/bin/env python3
"""
Convert Solar Power Generation Data to model format
Merges generation data with weather sensor data and creates model-compatible CSV
"""

import pandas as pd
import numpy as np
from pathlib import Path

DATA_DIR = Path(__file__).parent / "Solar Power Generation Data"

def convert_solar_data():
    """Convert real solar dataset to model format: timestamp, voltage, current, temperature"""
    
    print("Loading Solar Power Generation Data...")
    
    # Load generation data
    gen_df = pd.read_csv(DATA_DIR / "Plant_1_Generation_Data.csv")
    print(f"✓ Generation Data: {len(gen_df)} records")
    
    # Load weather data
    weather_df = pd.read_csv(DATA_DIR / "Plant_1_Weather_Sensor_Data.csv")
    print(f"✓ Weather Data: {len(weather_df)} records")
    
    # Standardize datetime format for generation data
    gen_df['DATE_TIME'] = pd.to_datetime(gen_df['DATE_TIME'], format='%d-%m-%Y %H:%M')
    
    # Standardize datetime format for weather data
    weather_df['DATE_TIME'] = pd.to_datetime(weather_df['DATE_TIME'])
    
    # Aggregate generation data by datetime (sum across all inverters)
    gen_agg = gen_df.groupby('DATE_TIME').agg({
        'DC_POWER': 'sum',
        'AC_POWER': 'sum'
    }).reset_index()
    
    # Aggregate weather data by datetime (average across sensors)
    weather_agg = weather_df.groupby('DATE_TIME').agg({
        'IRRADIATION': 'mean',
        'MODULE_TEMPERATURE': 'mean',
        'AMBIENT_TEMPERATURE': 'mean'
    }).reset_index()
    
    # Merge on datetime
    merged = pd.merge(gen_agg, weather_agg, on='DATE_TIME', how='inner')
    print(f"✓ Merged data: {len(merged)} records")
    
    # Create model-compatible format
    # voltage = DC_POWER / (IRRADIATION * area) - estimate from power output
    # current = IRRADIATION (substitute for measured current)
    # temperature = MODULE_TEMPERATURE
    # For voltage estimation: assume ~1m² panel, typical Voc~38V
    
    merged['voltage'] = np.where(
        merged['IRRADIATION'] > 0,
        merged['DC_POWER'] / (merged['IRRADIATION'] * 0.5 + 0.1),  # Rough estimation
        0
    ).clip(0, 50)  # Realistic voltage range
    
    merged['current'] = merged['IRRADIATION'] / 100  # Normalize irradiance to current-like scale
    merged['temperature'] = merged['MODULE_TEMPERATURE']
    merged['timestamp'] = merged['DATE_TIME']
    
    # Create output dataframe with required columns
    output = merged[['timestamp', 'voltage', 'current', 'temperature']].copy()
    
    # Clean data
    output = output.dropna()
    output = output[output['voltage'] >= 0]
    output = output[output['current'] >= 0]
    
    print(f"✓ Cleaned data: {len(output)} records")
    
    # Save to CSV
    output_path = Path(__file__).parent / "solar_generation_data_converted.csv"
    output.to_csv(output_path, index=False)
    print(f"✓ Saved to {output_path.name}")
    
    # Display stats
    print("\nData Statistics:")
    print(f"  Voltage: {output['voltage'].min():.2f}V - {output['voltage'].max():.2f}V")
    print(f"  Current: {output['current'].min():.2f}A - {output['current'].max():.2f}A")
    print(f"  Temperature: {output['temperature'].min():.2f}°C - {output['temperature'].max():.2f}°C")
    print(f"  Date range: {output['timestamp'].min()} to {output['timestamp'].max()}")
    
    return output_path

if __name__ == "__main__":
    convert_solar_data()
