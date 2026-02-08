"""Generate sample telemetry CSV for testing without database"""
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

def generate_telemetry_csv(filename="sample_telemetry.csv", num_days=30, samples_per_hour=4):
    """Generate realistic solar panel telemetry data and save to CSV"""
    
    samples_per_day = samples_per_hour * 24
    total_samples = num_days * samples_per_day
    interval_minutes = 60 // samples_per_hour
    
    start_time = datetime.now() - timedelta(days=num_days)
    
    print(f"Generating {total_samples} telemetry records...")
    
    data = []
    
    for i in range(total_samples):
        timestamp = start_time + timedelta(minutes=i * interval_minutes)
        hour = timestamp.hour + timestamp.minute / 60.0
        
        # Solar radiation simulation
        solar_factor = max(0, np.sin((hour - 6) * np.pi / 12))
        weather_variation = np.random.uniform(0.7, 1.0)
        solar_factor *= weather_variation
        
        # Voltage: ~18.5V base
        base_voltage = 18.5
        voltage = base_voltage + np.random.normal(0, 0.3) + (solar_factor * 0.5)
        voltage = max(0, min(21, voltage))
        
        # Current: 0-3A based on sunlight
        max_current = 3.0
        current = max_current * solar_factor + np.random.normal(0, 0.1)
        current = max(0, min(max_current, current))
        
        # Temperature: ambient + solar heating
        ambient_temp = 25 + np.random.normal(0, 3)
        solar_heating = solar_factor * 20
        temperature = ambient_temp + solar_heating + np.random.normal(0, 1)
        temperature = max(15, min(65, temperature))
        
        # Occasional anomalies
        if np.random.random() < 0.05:
            current *= np.random.uniform(0.3, 0.7)
        
        data.append({
            'timestamp': timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            'voltage': round(voltage, 2),
            'current': round(current, 2),
            'temperature': round(temperature, 2)
        })
    
    df = pd.DataFrame(data)
    
    output_path = Path(__file__).parent / filename
    df.to_csv(output_path, index=False)
    
    print(f"\n✓ Successfully generated {total_samples} records")
    print(f"✓ Saved to: {output_path}")
    print(f"\nData summary:")
    print(df.describe())
    print(f"\nFirst few rows:")
    print(df.head(10))
    
    return output_path

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate sample telemetry CSV")
    parser.add_argument('--days', type=int, default=30, help='Number of days')
    parser.add_argument('--samples-per-hour', type=int, default=4, help='Samples per hour')
    parser.add_argument('--output', type=str, default='sample_telemetry.csv', help='Output filename')
    args = parser.parse_args()
    
    generate_telemetry_csv(args.output, args.days, args.samples_per_hour)
