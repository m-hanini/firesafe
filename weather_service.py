"""
Weather Service for your project
Fetches real-time weather data from Open-Meteo API (free, no API key required)
"""
import requests
from datetime import datetime
from typing import Dict

class WeatherService:
    """Service to fetch and process weather data"""
    BASE_URL = "https://api.open-meteo.com/v1/forecast"

    @staticmethod
    def get_weather(latitude: float, longitude: float) -> Dict:
        """
        Fetch current weather for given coordinates
        """
        params = {
            'latitude': latitude,
            'longitude': longitude,
            'current': 'temperature_2m,wind_speed_10m,rain',
            'timezone': 'auto'
        }
        try:
            response = requests.get(WeatherService.BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            current = data.get('current', {})
            
            return {
                'wind_speed': current.get('wind_speed_10m', 0),
                'temperature': current.get('temperature_2m', 0),
                'rain_mm': current.get('rain', 0),
                'timestamp': datetime.now().isoformat()
            }
        except requests.RequestException as e:
            print(f"Weather API error: {e}")
            return {
                'wind_speed': 0,
                'temperature': 0,
                'rain_mm': 0,
                'error': str(e)
            }
