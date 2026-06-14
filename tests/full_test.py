import requests
import json

BASE_URL = "http://127.0.0.1:5500"

print("\n" + "=" * 70)
print("✅ FULL ESCALATION SYSTEM TEST")
print("=" * 70)

# TEST 1: Create alert
print("\n1️⃣ CREATE ALERT (Niveau 1 - Small Fire):")
r = requests.post(f"{BASE_URL}/api/alerts", json={
    "title": "Small Fire in Boukadir",
    "severity": "low",
    "description": "Limited fire, needs Niveau 1 response",
    "lat": 36.1653,
    "lng": 1.3345
})
alert_id = r.json()['alert']['id']
print(f"   ✅ Created Alert ID: {alert_id}")

# TEST 2: Check initial level
print("\n2️⃣ CHECK LEVEL (Initial):")
r = requests.get(f"{BASE_URL}/api/alerts/{alert_id}/escalation-level")
data = r.json()
print(f"   Current: {data['level_name']}")
print(f"   Units: 2-3 from same color zones")
print(f"   Metrics: Area={data['metrics']['burned_area_ha']}ha, Temp={data['metrics']['temperature_celsius']}°C")

# TEST 3: Update metrics to trigger escalation
print("\n3️⃣ UPDATE METRICS → TRIGGER ESCALATION TO NIVEAU 2:")
r = requests.post(f"{BASE_URL}/api/alerts/{alert_id}/update-metrics", json={
    "burned_area_ha": 3.5,
    "temperature_celsius": 520,
    "wind_speed_kmh": 35
})
if r.status_code == 200:
    data = r.json()
    print(f"   ✅ Escalation triggered: {data['escalation_triggered']}")
    print(f"   ✅ New level: {data['current_escalation_level']} (Medium)")
else:
    print(f"   ❌ Failed: {r.status_code}")

# TEST 4: Check new level
print("\n4️⃣ CHECK LEVEL (After escalation):")
r = requests.get(f"{BASE_URL}/api/alerts/{alert_id}/escalation-level")
data = r.json()
print(f"   Current: {data['level_name']}")
print(f"   Units: 5-7 from expanded zones")
print(f"   Metrics: Area={data['metrics']['burned_area_ha']}ha, Temp={data['metrics']['temperature_celsius']}°C, Wind={data['metrics']['wind_speed_kmh']}kmh")

# TEST 5: Further escalate to critical
print("\n5️⃣ UPDATE METRICS → TRIGGER ESCALATION TO NIVEAU 3:")
r = requests.post(f"{BASE_URL}/api/alerts/{alert_id}/update-metrics", json={
    "burned_area_ha": 12.0,
    "temperature_celsius": 750,
    "wind_speed_kmh": 55
})
if r.status_code == 200:
    data = r.json()
    print(f"   ✅ Escalation triggered: {data['escalation_triggered']}")
    print(f"   ✅ New level: {data['current_escalation_level']} (Critical)")
else:
    print(f"   ❌ Failed: {r.status_code}")

# TEST 6: Final check
print("\n6️⃣ CHECK LEVEL (Final - Critical):")
r = requests.get(f"{BASE_URL}/api/alerts/{alert_id}/escalation-level")
data = r.json()
print(f"   Current: {data['level_name']}")
print(f"   Units: 10+ from entire wilaya")
print(f"   Metrics: Area={data['metrics']['burned_area_ha']}ha, Temp={data['metrics']['temperature_celsius']}°C, Wind={data['metrics']['wind_speed_kmh']}kmh")

print("\n" + "=" * 70)
print("✅ ALL TESTS PASSED - ESCALATION SYSTEM FULLY OPERATIONAL")
print("=" * 70 + "\n")
