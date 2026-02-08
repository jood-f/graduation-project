"""
Generate sample telemetry data for testing the solar panel prediction model.
Simulates realistic voltage, current, and temperature readings from Arduino sensors.
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta
import numpy as np

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.db.database import SessionLocal
from app.models.telemetry import Telemetry
from app.models.panel import Panel


def generate_realistic_telemetry(num_days=30, samples_per_hour=4):
    """
    Generate realistic solar panel telemetry data.
    
    Simulates:
    - Voltage: ~17-21V (solar panel typical output)
    - Current: 0-3A (varies with sunlight)
    - Temperature: 20-60°C (panel heating)
    - Daily cycle: low at night, peak at noon
    """
    
    db = SessionLocal()
    
    try:
        # Get or create a test panel
        panel = db.query(Panel).first()
        
        if not panel:
            print("No panel found in database. Please create a panel first.")
            print("Example: Add a panel through the API or database")
            return
        
        panel_id = panel.id
        print(f"Using panel ID: {panel_id}")
        
        # Calculate total samples
        samples_per_day = samples_per_hour * 24
        total_samples = num_days * samples_per_day
        interval_minutes = 60 // samples_per_hour
        
        start_time = datetime.now() - timedelta(days=num_days)
        
        print(f"Generating {total_samples} telemetry records...")
        print(f"Time range: {num_days} days, sampling every {interval_minutes} minutes")
        
        records = []
        
        for i in range(total_samples):
            timestamp = start_time + timedelta(minutes=i * interval_minutes)
            
            # Hour of day (0-23)
            hour = timestamp.hour + timestamp.minute / 60.0
            
            # Solar radiation simulation (0 at night, peak at noon)
            # Using sine wave: peak at hour 12, zero at night
            solar_factor = max(0, np.sin((hour - 6) * np.pi / 12))
            
            # Add some randomness and weather variations
            weather_variation = np.random.uniform(0.7, 1.0)
            solar_factor *= weather_variation
            
            # Voltage: relatively stable, slight variation with temperature
            base_voltage = 18.5
            voltage = base_voltage + np.random.normal(0, 0.3) + (solar_factor * 0.5)
            voltage = max(0, min(21, voltage))  # Clamp to realistic range
            
            # Current: highly dependent on sunlight
            max_current = 3.0
            current = max_current * solar_factor + np.random.normal(0, 0.1)
            current = max(0, min(max_current, current))
            
            # Temperature: ambient + solar heating
            ambient_temp = 25 + np.random.normal(0, 3)  # 20-30°C ambient
            solar_heating = solar_factor * 20  # Up to 20°C heating from sun
            temperature = ambient_temp + solar_heating + np.random.normal(0, 1)
            temperature = max(15, min(65, temperature))  # Realistic range
            
            # Add occasional anomalies (5% chance)
            if np.random.random() < 0.05:
                # Simulate partial shading or dirt
                current *= np.random.uniform(0.3, 0.7)
            
            record = Telemetry(
                panel_id=panel_id,
                voltage=float(voltage),
                current=float(current),
                temperature=float(temperature),
                timestamp=timestamp
            )
            
            records.append(record)
            
            if (i + 1) % 1000 == 0:
                print(f"  Generated {i + 1}/{total_samples} records...")
        
        # Bulk insert
        print("Inserting records into database...")
        db.bulk_save_objects(records)
        db.commit()
        
        print(f"\n✓ Successfully generated and saved {total_samples} telemetry records")
        print(f"  Time range: {records[0].timestamp} to {records[-1].timestamp}")
        print(f"  Voltage range: {min(r.voltage for r in records):.2f}V - {max(r.voltage for r in records):.2f}V")
        print(f"  Current range: {min(r.current for r in records):.2f}A - {max(r.current for r in records):.2f}A")
        print(f"  Temperature range: {min(r.temperature for r in records):.2f}°C - {max(r.temperature for r in records):.2f}°C")
        
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate sample telemetry data")
    parser.add_argument('--days', type=int, default=30, help='Number of days of data to generate')
    parser.add_argument('--samples-per-hour', type=int, default=4, help='Samples per hour')
    args = parser.parse_args()
    
    generate_realistic_telemetry(num_days=args.days, samples_per_hour=args.samples_per_hour)
