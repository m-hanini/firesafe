import requests

# Test 1: Create alert
r = requests.post("http://127.0.0.1:5500/api/alerts", json={
    "title": "Test", "severity": "low", "lat": 36.1653, "lng": 1.3345
})

print("CREATE ALERT:")
print(f"  Status: {r.status_code}")
data = r.json()
print(f"  Response keys: {list(data.keys())}")

if 'alert' in data:
    aid = data['alert'].get('id')
    print(f"  Alert ID: {aid}")
    
    # Test escalation endpoint
    r2 = requests.get(f"http://127.0.0.1:5500/api/alerts/{aid}/escalation-level")
    print(f"\nESCALATION ENDPOINT: {r2.status_code}")
    if r2.status_code == 200:
        print(f"  ✅ Response: {r2.json()['level_name']}")
    else:
        print(f"  ❌ Error: 404 - endpoint not found")
        print(f"     URL was: /api/alerts/{aid}/escalation-level")
