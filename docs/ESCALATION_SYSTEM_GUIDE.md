# 🔥 Multi-Level Intelligent Intervention System (Système d'Escalade Intelligent)

## Overview
The system automatically escalates fire response based on real-time fire progression metrics, deploying additional units and expanding the operational area as the fire grows.

---

## 🎯 Three Escalation Levels

### **Niveau 1 - Petit Incendie (Small Fire) - LIMITED AREA**
- **Burned Area**: < 1 ha
- **Temperature**: < 400°C
- **Wind Speed**: < 20 km/h
- **Alert Count**: 1 (single point)
- **Zone Selection**: Same zone + same-color zones ONLY
- **Units Dispatched**: Base requirement (2-3 units)
- **Example**: Boukadir + Soubha → 2 CCI + 1 Ambulance

### **Niveau 2 - Feu Moyen (Medium Fire) - SPREADING**
- **Burned Area**: 1-5 ha
- **Temperature**: 400-600°C
- **Wind Speed**: 20-40 km/h
- **Alert Count**: 2-4 points
- **Zone Selection**: Same-color zones + 2 nearest neighbors
- **Units Dispatched**: Base × 1.5 (5-7 units with reinforcements)
- **Trigger**: Fire expands beyond initial containment zone
- **Response**: Add Ouled Fares + Chlef units automatically

### **Niveau 3 - Grand Incendie (Large Fire) - CRITICAL**
- **Burned Area**: > 5 ha
- **Temperature**: > 600°C
- **Wind Speed**: > 40 km/h
- **Alert Count**: > 4 points
- **Zone Selection**: ALL ZONES (wilaya-wide mobilization)
- **Units Dispatched**: Base × 2.5 (10+ units + wilaya support)
- **Trigger**: Fire becomes uncontrollable or spreads rapidly
- **Response**: Full mobilization across all communes

---

## 📊 Metrics Scoring System (0-100 Scale)

The system continuously evaluates fire progression:

### Burned Area Contribution
```
< 1 ha  → 10 points
1-5 ha  → 20 points
> 5 ha  → 30 points
```

### Temperature Contribution
```
< 400°C   → 10 points
400-600°C → 20 points
> 600°C   → 30 points
```

### Wind Speed Contribution
```
< 20 km/h  → 5 points
20-40 km/h → 10 points
> 40 km/h  → 20 points
```

### Alert Count (Multiple ignitions in zone)
```
1 alert    → 5 points
2-4 alerts → 10 points
> 4 alerts → 20 points
```

### Escalation Thresholds
```
Score < 35:  Niveau 1 (Small)
Score 35-59: Niveau 2 (Medium)
Score >= 60: Niveau 3 (Large)
```

---

## 🚀 How It Works - Step by Step

### 1️⃣ Initial Incident Report
```json
POST /api/alerts
{
  "title": "Incendie à Boukadir",
  "severity": "low",
  "description": "Small fire spotted",
  "lat": 36.1653,
  "lng": 1.3345
}
```

**System evaluates**:
- Burned area = 0.5 ha
- Temperature = 350°C
- Wind = 15 km/h
- Alert count = 1
- **Score = 10 + 10 + 5 + 5 = 30 → NIVEAU 1** ✅

**Dispatch**: 2 units from Boukadir/Soubha only

---

### 2️⃣ Fire Spreads - Metrics Updated
```json
POST /api/alerts/{id}/update-metrics
{
  "burned_area_ha": 3.5,
  "temperature_celsius": 520,
  "wind_speed_kmh": 35
}
```

**System re-evaluates**:
- Burned area = 3.5 ha → 20 pts
- Temperature = 520°C → 20 pts  
- Wind = 35 km/h → 10 pts
- Alert count = 2 → 10 pts
- **Score = 20 + 20 + 10 + 10 = 60 → NIVEAU 2 ESCALATION!** 🔴

**Automatic Actions**:
1. ✅ Update escalation_level = 2
2. ✅ Deploy 5-7 units (1.5x base)
3. ✅ Add Ouled Fares + Chlef units
4. 🔔 Send critical notification to dispatch center
5. 📋 Log escalation event

---

### 3️⃣ Fire Becomes Critical
```json
POST /api/alerts/{id}/update-metrics
{
  "burned_area_ha": 12.0,
  "temperature_celsius": 750,
  "wind_speed_kmh": 55
}
```

**System re-evaluates**:
- Burned area = 12 ha → 30 pts
- Temperature = 750°C → 30 pts
- Wind = 55 km/h → 20 pts
- Alert count = 5 → 20 pts
- **Score = 30 + 30 + 20 + 20 = 100 → NIVEAU 3 CRITICAL!** 🔥

**Full Mobilization**:
1. ✅ Activate ALL zones (Chlef, Coastal, Southern, etc.)
2. ✅ Deploy 10+ units from entire wilaya
3. ✅ Call wilaya command center
4. 🔔 Maximum priority alerts sent
5. 📻 Broadcast to all emergency services

---

## 📡 API Endpoints

### Update Fire Metrics (Automatic Escalation)
```
POST /api/alerts/{id}/update-metrics
Content-Type: application/json

{
  "burned_area_ha": 5.5,
  "temperature_celsius": 650,
  "wind_speed_kmh": 42
}

Response:
{
  "success": true,
  "current_escalation_level": 3,
  "escalation_triggered": true,
  "metrics": {
    "burned_area_ha": 5.5,
    "temperature_celsius": 650,
    "wind_speed_kmh": 42
  }
}
```

### Manual Escalation (Admin Override)
```
POST /api/alerts/{id}/escalate

Response:
{
  "success": true,
  "previous_level": 1,
  "new_level": 2,
  "new_dispatch_count": 5,
  "algorithm_used": "NSGA-II"
}
```

### Check Current Escalation Level
```
GET /api/alerts/{id}/escalation-level

Response:
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
  "last_update": "2026-05-12T15:45:00+00:00"
}
```

---

## 💡 Key Features

### ✅ Automatic Escalation
- Fire metrics continuously monitored
- System auto-escalates when thresholds crossed
- No manual intervention required

### ✅ Dynamic Zone Selection
- **Level 1**: Local zones only (same color)
- **Level 2**: Add 2 nearest geographical neighbors
- **Level 3**: Full wilaya deployment

### ✅ Intelligent Unit Scaling
```
Level 1: 1.0x (2 units for "low" severity)
Level 2: 1.5x (3 units for "low" severity)  
Level 3: 2.5x (5 units for "low" severity)
```

### ✅ Real-Time Notifications
- Critical alerts sent to dispatch center
- Escalation events logged
- Unit commanders notified of reassignments

### ✅ Admin Override Capability
- Manual escalation endpoint available
- One-level-at-a-time to prevent errors
- Full audit trail maintained

---

## 🔧 Database Schema

### New Columns Added to `alerts` Table
```sql
ALTER TABLE alerts ADD COLUMN burned_area_ha REAL DEFAULT 0.0;
ALTER TABLE alerts ADD COLUMN temperature_celsius INTEGER DEFAULT 0;
ALTER TABLE alerts ADD COLUMN wind_speed_kmh REAL DEFAULT 0.0;
ALTER TABLE alerts ADD COLUMN fire_intensity_index REAL DEFAULT 0.0;
ALTER TABLE alerts ADD COLUMN escalation_level INTEGER DEFAULT 1;
ALTER TABLE alerts ADD COLUMN last_metrics_update TEXT;
```

---

## 📊 Unit Dispatch Examples

### Scenario 1: Small Fire in Boukadir (Niveau 1)
```
Metrics: Area=0.5ha, Temp=350°C, Wind=15kmh, Alerts=1
Score: 30 → NIVEAU 1

Zones Activated: Boukadir, Soubha (red group only)
Units: 2 dispatched
- Unit 1: Chlef Central (CCI)
- Unit 2: Tenes Unit (Ambulance)
```

### Scenario 2: Spreading Fire (Niveau 2)
```
Metrics: Area=3.5ha, Temp=520°C, Wind=35kmh, Alerts=2
Score: 60 → NIVEAU 2

Zones Activated: Boukadir, Soubha, Ouled Fares, Chlef
Units: 5 dispatched (1.5x base)
- Units from red zone (Boukadir/Soubha)
- + Units from blue zone (Coastal) if available
- + Units from Chlef reinforcements
```

### Scenario 3: Critical Fire (Niveau 3)
```
Metrics: Area=12ha, Temp=750°C, Wind=55kmh, Alerts=5+
Score: 100 → NIVEAU 3

Zones Activated: ALL (Wilaya-wide)
Units: 10+ dispatched (2.5x base)
- All available units from entire wilaya
- Wilaya command center activated
- Inter-zone coordination initiated
```

---

## 🎓 Integration Examples

### Frontend: Update Metrics on Status Change
```javascript
// When fire observer reports updated conditions
async function reportFireMetrics(alertId) {
  const response = await fetch(`/api/alerts/${alertId}/update-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      burned_area_ha: 5.5,
      temperature_celsius: 650,
      wind_speed_kmh: 42
    })
  });
  
  const data = await response.json();
  if (data.escalation_triggered) {
    console.log(`🔴 ESCALATION: Level ${data.current_escalation_level}`);
    // Refresh unit list, show new dispatch map, etc.
  }
}
```

### Manual Escalation Command (Admin Only)
```javascript
async function escalateIncident(alertId) {
  const response = await fetch(`/api/alerts/${alertId}/escalate`, {
    method: 'POST'
  });
  
  const data = await response.json();
  console.log(`Escalated: Level ${data.previous_level} → ${data.new_level}`);
  console.log(`New units: ${data.new_dispatch_count}`);
}
```

### Check Escalation Status
```javascript
async function getEscalationStatus(alertId) {
  const response = await fetch(`/api/alerts/${alertId}/escalation-level`);
  const data = await response.json();
  
  console.log(`Current Level: ${data.level_name}`);
  console.log(`Fire Size: ${data.metrics.burned_area_ha} ha`);
  console.log(`Units in zone: ${data.metrics.alert_count_in_zone}`);
}
```

---

## 🔐 Safety Features

1. **Gradual Escalation**: Only one level at a time
2. **Max Level Cap**: Level 3 is maximum (prevents over-escalation)
3. **Metric Validation**: All inputs validated before applying
4. **Audit Trail**: All escalations logged with user info
5. **Fallback Logic**: If optimizer fails, tactical candidates used
6. **Zone Backfill**: Units automatically assigned to nearest zones

---

## 📈 Future Enhancements

- [ ] Integration with weather service for real-time wind/temperature
- [ ] Satellite imagery integration for burned area detection
- [ ] Machine learning for prediction-based pre-escalation
- [ ] Integration with drone thermal imaging for accurate temperature
- [ ] Mobile app push notifications for escalations
- [ ] Inter-wilaya resource sharing for Level 3 fires

---

**Implemented**: May 12, 2026  
**System**: FireSafe AI - Emergency Intelligence Platform  
**Region**: Chlef Wilaya, Algeria
