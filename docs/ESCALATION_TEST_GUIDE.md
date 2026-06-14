# 🧪 ESCALATION SYSTEM - TEST EXAMPLES

Quick reference for testing the new multi-level intervention system.

---

## 1️⃣ CREATE INITIAL INCIDENT (Level 1)

```bash
curl -X POST http://127.0.0.1:5500/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Petit incendie à Boukadir",
    "severity": "low",
    "description": "Small fire spotted near residential area",
    "lat": 36.1653,
    "lng": 1.3345
  }'
```

**Expected Result**:
- Escalation Level: 1 (Petit)
- Zones: Boukadir + Soubha only
- Units: 2 dispatched

---

## 2️⃣ UPDATE METRICS - TRIGGER ESCALATION TO LEVEL 2

Fire spreading → Update metrics

```bash
curl -X POST http://127.0.0.1:5500/api/alerts/1/update-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "burned_area_ha": 3.5,
    "temperature_celsius": 520,
    "wind_speed_kmh": 35
  }'
```

**System Response**:
```json
{
  "success": true,
  "current_escalation_level": 2,
  "escalation_triggered": true,
  "metrics": {
    "burned_area_ha": 3.5,
    "temperature_celsius": 520,
    "wind_speed_kmh": 35
  }
}
```

**What Happened**:
- Fire intensity score: 60 (crossed Level 2 threshold)
- 🔴 Automatic escalation triggered!
- Additional 3-4 units deployed from Ouled Fares + Chlef
- Critical notification sent to dispatch center

---

## 3️⃣ CHECK CURRENT ESCALATION STATUS

```bash
curl -X GET http://127.0.0.1:5500/api/alerts/1/escalation-level
```

**Response**:
```json
{
  "success": true,
  "alert_id": 1,
  "current_level": 2,
  "level_name": "Niveau 2 - Feu Moyen (Extension)",
  "level_description": "Zones: Ajout des voisins adjacents. Unités: 5-7 renforts.",
  "metrics": {
    "burned_area_ha": 3.5,
    "temperature_celsius": 520,
    "wind_speed_kmh": 35,
    "alert_count_in_zone": 2
  },
  "last_update": "2026-05-12T15:30:00+00:00"
}
```

---

## 4️⃣ FURTHER ESCALATION TO LEVEL 3 (CRITICAL)

Fire becomes critical → Update to extreme metrics

```bash
curl -X POST http://127.0.0.1:5500/api/alerts/1/update-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "burned_area_ha": 12.0,
    "temperature_celsius": 750,
    "wind_speed_kmh": 55
  }'
```

**System Response**:
```json
{
  "success": true,
  "current_escalation_level": 3,
  "escalation_triggered": true,
  "metrics": {
    "burned_area_ha": 12.0,
    "temperature_celsius": 750,
    "wind_speed_kmh": 55
  }
}
```

**Critical Actions Taken**:
- 🔥 Level 3 escalation activated!
- All zones mobilized (Chlef + Coastal + Southern)
- 10+ units deployed
- Wilaya command center alerted
- Maximum priority notifications sent

---

## 5️⃣ MANUAL ESCALATION (Admin Override)

Admin command to escalate immediately without waiting for metrics

```bash
curl -X POST http://127.0.0.1:5500/api/alerts/1/escalate \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "previous_level": 1,
  "new_level": 2,
  "new_dispatch_count": 5,
  "algorithm_used": "NSGA-II"
}
```

**Use Case**: Dispatch commander sees fire spreading on ground and escalates immediately

---

## 🔄 COMPLETE WORKFLOW EXAMPLE

### Step 1: Citizen Reports Fire
```bash
# Creates alert with minimal info
curl -X POST http://127.0.0.1:5500/api/alerts \
  -H "Content-Type: application/json" \
  -d '{"title":"Fire!","severity":"low","lat":36.1653,"lng":1.3345}'

# Returns: alert_id = 1, escalation_level = 1
```

### Step 2: Initial Dispatch (Level 1)
- 2 units from Boukadir dispatched
- ETA: ~8 minutes
- Status: En route

### Step 3: Fire Observer Reports Expansion (5 min later)
```bash
curl -X POST http://127.0.0.1:5500/api/alerts/1/update-metrics \
  -H "Content-Type: application/json" \
  -d '{"burned_area_ha":2.5,"temperature_celsius":450,"wind_speed_kmh":28}'

# Returns: escalation_triggered = true, current_escalation_level = 2
```

### Step 4: Additional Units Auto-Deployed
- 3 more units from adjacent zones dispatched
- Total: 5 units responding
- New ETA calculations sent

### Step 5: Dispatch Commander Monitors
```bash
# Check status every minute
curl -X GET http://127.0.0.1:5500/api/alerts/1/escalation-level

# See current level, metrics, unit count
```

### Step 6: Critical Update Arrives (Fire Exploding)
```bash
curl -X POST http://127.0.0.1:5500/api/alerts/1/update-metrics \
  -H "Content-Type: application/json" \
  -d '{"burned_area_ha":8.0,"temperature_celsius":680,"wind_speed_kmh":48}'

# Triggers Level 3 - Wilaya-wide mobilization
```

---

## 📊 METRICS CALCULATION REFERENCE

### Score Calculation
```
Fire Score = Burned Area Points + Temperature Points + Wind Points + Alert Points

Example 1: Burned 0.5 ha, 350°C, 15 km/h, 1 alert
  = 10 + 10 + 5 + 5 = 30 points → Level 1 (Small)

Example 2: Burned 3.5 ha, 520°C, 35 km/h, 2 alerts
  = 20 + 20 + 10 + 10 = 60 points → Level 2 (Medium)

Example 3: Burned 12 ha, 750°C, 55 km/h, 5 alerts
  = 30 + 30 + 20 + 20 = 100 points → Level 3 (Large)
```

### Thresholds
```
Score < 35:  🟢 Niveau 1 (Petit)
Score 35-59: 🟡 Niveau 2 (Moyen)  
Score ≥ 60:  🔴 Niveau 3 (Grand)
```

---

## 🔍 TESTING CHECKLIST

- [ ] Create incident with `POST /api/alerts`
- [ ] Verify initial escalation_level = 1
- [ ] Update metrics with `POST /api/alerts/{id}/update-metrics`
- [ ] Confirm escalation_triggered = true when score threshold crossed
- [ ] Check new units added to dispatch
- [ ] Get status with `GET /api/alerts/{id}/escalation-level`
- [ ] Verify metrics reflected in response
- [ ] Test manual escalation with `POST /api/alerts/{id}/escalate`
- [ ] Check that escalation cannot exceed level 3
- [ ] Verify notifications sent on escalation
- [ ] Confirm activity logged in database

---

## 🧑‍💻 PYTHON CLIENT EXAMPLE

```python
import requests
import json

BASE_URL = "http://127.0.0.1:5500"

# Create incident
def create_incident():
    response = requests.post(f"{BASE_URL}/api/alerts", json={
        "title": "Incendie Boukadir",
        "severity": "low",
        "description": "Small fire",
        "lat": 36.1653,
        "lng": 1.3345
    })
    return response.json()

# Update metrics and trigger escalation
def update_fire_metrics(alert_id, burned_area, temp, wind):
    response = requests.post(
        f"{BASE_URL}/api/alerts/{alert_id}/update-metrics",
        json={
            "burned_area_ha": burned_area,
            "temperature_celsius": temp,
            "wind_speed_kmh": wind
        }
    )
    return response.json()

# Get escalation status
def get_escalation_status(alert_id):
    response = requests.get(f"{BASE_URL}/api/alerts/{alert_id}/escalation-level")
    return response.json()

# Manual escalation
def escalate_manually(alert_id):
    response = requests.post(f"{BASE_URL}/api/alerts/{alert_id}/escalate")
    return response.json()

# Test workflow
if __name__ == "__main__":
    # Step 1: Create incident
    incident = create_incident()
    alert_id = incident['id']
    print(f"✅ Incident created: {alert_id}, Level: {incident.get('escalation_level', 1)}")
    
    # Step 2: Simulate fire expansion
    print("\n🔥 Fire expanding...")
    result = update_fire_metrics(alert_id, burned_area=3.5, temp=520, wind=35)
    print(f"📊 Escalation triggered: {result['escalation_triggered']}")
    print(f"📈 New level: {result['current_escalation_level']}")
    
    # Step 3: Check status
    status = get_escalation_status(alert_id)
    print(f"\n📋 Current Status:")
    print(f"   Level: {status['level_name']}")
    print(f"   Burned: {status['metrics']['burned_area_ha']} ha")
    print(f"   Temp: {status['metrics']['temperature_celsius']}°C")
    print(f"   Wind: {status['metrics']['wind_speed_kmh']} km/h")
```

---

## 📞 SUPPORT

For issues or questions about the escalation system, check:
- [ESCALATION_SYSTEM_GUIDE.md](ESCALATION_SYSTEM_GUIDE.md) - Full documentation
- [ESCALATION_IMPLEMENTATION_SUMMARY.md](ESCALATION_IMPLEMENTATION_SUMMARY.md) - Technical summary
- [app.py](app.py) - Source code

---

**Ready to test? Start the app and try the examples above!**

```bash
python app.py
```

Then navigate to http://127.0.0.1:5500 and use the curl commands or Python client to test the system.
