#!/usr/bin/env python3
"""Test the multi-level escalation system"""

import requests
import json

BASE_URL = "http://127.0.0.1:5500"

print("=" * 60)
print("TESTING ESCALATION SYSTEM")
print("=" * 60)

# Test 1: Create an alert
print("\n1️⃣ CREATE ALERT:")
try:
    response = requests.post(f"{BASE_URL}/api/alerts", json={
        "title": "Test Fire Escalation",
        "severity": "low",
        "description": "Testing escalation system",
        "lat": 36.1653,
        "lng": 1.3345
    })
    print(f"   Status: {response.status_code}")
    if response.status_code in [200, 201]:
        alert = response.json()
        alert_id = alert.get('id')
        print(f"   ✅ Alert created: ID={alert_id}")
    else:
        print(f"   ❌ Error: {response.text[:100]}")
        alert_id = 1
except Exception as e:
    print(f"   ❌ Error: {e}")
    alert_id = 1

# Test 2: Check initial escalation level
print("\n2️⃣ CHECK ESCALATION LEVEL (Before update):")
try:
    response = requests.get(f"{BASE_URL}/api/alerts/{alert_id}/escalation-level")
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Current Level: {data['current_level']}")
        print(f"   ✅ Level Name: {data['level_name']}")
    else:
        print(f"   ❌ Error: {response.text[:100]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test 3: Update metrics to trigger escalation
print("\n3️⃣ UPDATE METRICS (Trigger escalation to Level 2):")
try:
    response = requests.post(f"{BASE_URL}/api/alerts/{alert_id}/update-metrics", json={
        "burned_area_ha": 3.5,
        "temperature_celsius": 520,
        "wind_speed_kmh": 35
    })
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Escalation triggered: {data.get('escalation_triggered')}")
        print(f"   ✅ New Level: {data.get('current_escalation_level')}")
    else:
        print(f"   ❌ Error: {response.text[:100]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test 4: Check updated escalation level
print("\n4️⃣ CHECK ESCALATION LEVEL (After update):")
try:
    response = requests.get(f"{BASE_URL}/api/alerts/{alert_id}/escalation-level")
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Current Level: {data['current_level']}")
        print(f"   ✅ Level Name: {data['level_name']}")
        print(f"   ✅ Burned Area: {data['metrics']['burned_area_ha']} ha")
        print(f"   ✅ Temperature: {data['metrics']['temperature_celsius']}°C")
        print(f"   ✅ Wind Speed: {data['metrics']['wind_speed_kmh']} km/h")
    else:
        print(f"   ❌ Error: {response.text[:100]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test 5: Manual escalation
print("\n5️⃣ MANUAL ESCALATION (Level 2 → 3):")
try:
    response = requests.post(f"{BASE_URL}/api/alerts/{alert_id}/escalate")
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Previous Level: {data['previous_level']}")
        print(f"   ✅ New Level: {data['new_level']}")
        print(f"   ✅ Units dispatched: {data['new_dispatch_count']}")
    else:
        print(f"   ⚠️  Warning: {response.status_code} - {response.text[:100]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test 6: Check final level
print("\n6️⃣ CHECK FINAL ESCALATION LEVEL:")
try:
    response = requests.get(f"{BASE_URL}/api/alerts/{alert_id}/escalation-level")
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Current Level: {data['current_level']}")
        print(f"   ✅ Level Name: {data['level_name']}")
    else:
        print(f"   ❌ Error: {response.text[:100]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

print("\n" + "=" * 60)
print("✅ ESCALATION SYSTEM TEST COMPLETE")
print("=" * 60)
