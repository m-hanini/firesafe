//   PDF  fireman_tactical

//   PDF   

const mapConfig = {
    startLat: 36.1653,
    startLng: 1.3345,
    zoom: 10
};

const state = {
    currentMode: "dashboard",
    lastClickedLocation: null,
    selectedAlgorithm: "ga",
    alerts: [],
    units: [],
    equipment: [],
    zones: [],
    dispatches: [],
    summary: null,
    notifications: [],
    notificationCursor: 0,
    notificationInitialized: false,
    localIncidents: [],
    waterSources: [],
    showArchivedZones: false
};

const OFFLINE_QUEUE_KEY = "chlef_offline_alert_queue_v1";

const algeriaBounds = [
    [18.5, -9.0],
    [37.5, 12.0]
];

let map;

const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 19
});

const osmLayer = tileLayer;
const darkLayer = tileLayer; // Keep it the same to satisfy any other references

const unitLayer = L.layerGroup();
const alertLayer = L.layerGroup();
const actionLayer = L.layerGroup();
const zoneCircleLayer = L.layerGroup(); // Dedicated layer for tactical zones
const routeLayer = L.layerGroup(); // Dedicated layer for mission routes
let convergenceChart, resourcePieChart, globalRadarChart;
let comparisonChart;

const zoneLayer = L.geoJSON(null, {
    style: (feature) => {
        if (feature?.properties?.type === "water_source") {
            return {
                color: "#0ea5e9", // cyan/blue
                weight: 2,
                fillColor: "#0ea5e9",
                fillOpacity: 0.3,
                dashArray: "3 5"
            };
        }
        if (feature?.properties?.type === "flood_zone") {
            return {
                color: "#3b82f6", 
                weight: 2,
                fillColor: "#3b82f6",
                fillOpacity: 0.2,
                dashArray: "2 6"
            };
        }
        const risk = String(feature?.properties?.risk_level || "medium").toLowerCase();
        const color = risk === "high" ? "#ef4444" : risk === "low" ? "#22c55e" : "#f59e0b";
        return {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.12,
            dashArray: "4 4"
        };
    },
    onEachFeature: (feature, layer) => {
        const name = feature?.properties?.name || "Unknown Zone";
        const riskLevel = String(feature?.properties?.risk_level || "medium").toUpperCase();
        let popupContent = `<b>${name}</b><br/>Risk: ${riskLevel}`;
        
        if (feature?.properties?.type === "water_source") {
            popupContent = `<b>${name}</b><br/>\uD83D\uDCA7 Point d'eau / Barrage`;
        } else if (feature?.properties?.type === "flood_zone") {
            popupContent = `<b>${name}</b><br/> Zone Humide (Faible risque)`;
        } else if (feature?.properties?.type === "forest_zone") {
            popupContent = `<b>${name}</b><br/> Zone Forestire / Sensible`;
        }
        
        layer.bindPopup(popupContent);
    }
});

let pendingSelectionMarker = null;

function severityColor(severity) {
    const value = (severity || "medium").toLowerCase();
    if (value === "critical") return "#ef4444";
    if (value === "high") return "#f97316";
    if (value === "low") return "#00f0ff";
    return "#fbbf24";
}

async function fetchJSON(url, options = {}) {
    const separator = url.includes('?') ? '&' : '?';
    const finalUrl = `${url}${separator}_t=${Date.now()}`;
    const response = await fetch(finalUrl, {
        headers: { "Content-Type": "application/json" },
        ...options
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

function showToast(title, subtitle, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    // --- NEW: Clear existing toasts to prevent clutter ---
    container.innerHTML = '';

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.style.animation = "slideIn 0.3s ease forwards";
    toast.innerHTML = `<strong>${title}</strong><div style="margin-top:4px; font-size:0.85rem; opacity:0.9;">${subtitle}</div>`;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode === container) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }
    }, 3800);
}

function getOfflineQueue() {
    try {
        const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

function setOfflineQueue(queue) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function queueOfflineIncident(payload) {
    const queue = getOfflineQueue();
    queue.push({
        payload,
        createdAt: new Date().toISOString()
    });
    setOfflineQueue(queue);
    return queue.length;
}

async function flushOfflineQueue(showResultToast = false) {
    if (!navigator.onLine) return;

    const queue = getOfflineQueue();
    if (!queue.length) return;

    let sentCount = 0;
    const remaining = [];

    for (const item of queue) {
        try {
            await fetchJSON("/api/alerts", {
                method: "POST",
                body: JSON.stringify(item.payload)
            });
            sentCount += 1;
        } catch (error) {
            const message = String(error?.message || "");
            if (message.startsWith("HTTP 4")) {
                continue;
            }
            remaining.push(item);
        }
    }

    setOfflineQueue(remaining);

    if (sentCount > 0) {
        await refreshData();
        if (showResultToast) {
            showToast("Sync Complete", `${sentCount} offline alert(s) sent`, "success");
        }
    }
}

function clearPendingSelection(message) {
    const confirmBtn = document.getElementById("map-confirm-btn");
    if (confirmBtn) confirmBtn.classList.remove("visible");

    const instruction = document.querySelector(".map-instruction");
    if (instruction && message) instruction.innerText = message;

    if (pendingSelectionMarker) {
        map.removeLayer(pendingSelectionMarker);
        pendingSelectionMarker = null;
    }
}

function getNotificationMeta(severity, status) {
    const level = String(severity || "medium").toLowerCase();
    
    if (status === "pending") {
        return { icon: "🆕", action: "verify", actionLabel: "VERIFY" };
    }
    
    if (level === "critical" || level === "high" || level === "warning") {
        return { icon: "🔥", action: "view", actionLabel: "RESPOND" };
    }
    return { icon: "⚠️", action: "view", actionLabel: "VIEW UNIT" };
}

/**
 * Focus the map on a specific incident location
 */
function focusIncident(id, lat, lng) {
    if (!lat || !lng) {
        showToast("Erreur", "Position non disponible pour cet incident", "error");
        return;
    }
    
    // Switch to map view if needed
    if (state.currentMode === "panels") {
        toggleMapView();
    }

    // Mark as read
    markNotificationRead(id);
    renderNotificationsDropdown();

    // Fly to location
    if (window.map) {
        window.map.flyTo([lat, lng], 18, {
            animate: true,
            duration: 1.5
        });

        // Add a temporary highlight circle
        const marker = L.circleMarker([lat, lng], {
            radius: 40,
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.3,
            weight: 2
        }).addTo(window.map);

        setTimeout(() => {
            window.map.removeLayer(marker);
        }, 3000);
    }
}

function markNotificationRead(id) {
    const notif = state.notifications.find((item) => item.id === id);
    if (!notif) return;
    notif.unread = false;
}

/**
 * Animates a marker from one position to another
 */
function animateMarker(marker, startPos, endPos, duration = 2000) {
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Linear interpolation
        const lat = startPos[0] + (endPos[0] - startPos[0]) * progress;
        const lng = startPos[1] + (endPos[1] - startPos[1]) * progress;
        
        marker.setLatLng([lat, lng]);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

/**
 * Visualizes units moving towards an incident
 */
function visualizeUnitMovement(alertLat, alertLng) {
    const activeDispatches = state.dispatches.filter(d => 
        d.lat && d.lng && // unit current pos (might be same as start)
        !d.completed
    );

    activeDispatches.forEach(dispatch => {
        // Find the unit in state to get its current base location
        const unit = state.units.find(u => u.id === dispatch.unit_id);
        if (!unit) return;

        const startPos = [unit.lat, unit.lng];
        const endPos = [alertLat, alertLng];

        // Create a moving marker
        const iconChar = (dispatch.equipment_type || "").toLowerCase().includes("heli") ? "🚁" : 
                         (dispatch.equipment_type || "").toLowerCase().includes("drone") ? "🛸" : "🚒";
        
        const movingMarker = L.marker(startPos, {
            icon: L.divIcon({
                html: `<div style="font-size: 24px; filter: drop-shadow(0 0 5px rgba(255,255,255,0.8)); animation: pulse 1s infinite;">${iconChar}</div>`,
                className: 'moving-unit-icon',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        }).addTo(actionLayer);

        // Calculate duration based on distance (or ETA if available)
        const duration = Math.min(Math.max((dispatch.eta_minutes || 5) * 1000, 3000), 10000); 

        animateMarker(movingMarker, startPos, endPos, duration);

        // Remove marker after arrival animation
        setTimeout(() => {
            actionLayer.removeLayer(movingMarker);
            showToast("Unit Arrived", `${unit.name} has arrived at the scene`, "success");
        }, duration + 500);
    });
}

async function clearAllNotifications() {
    try {
        await fetchJSON("/api/notifications/clear", { method: "POST" });
        state.notifications = [];
        renderNotificationsDropdown();
        // showToast("Notifications", "All cleared", "info");
    } catch (e) {
        console.error("Failed to clear notifications:", e);
    }
}

async function handleNotificationAction(action, id) {
    const notif = state.notifications.find(n => n.id === id);
    if (!notif) return;
    
    // Mark as read in frontend
    notif.unread = false;
    renderNotificationsDropdown();

    // Mark as read in backend
    try {
        await fetchJSON(`/api/notifications/${id}/read`, { method: 'POST' });
    } catch (e) {
        console.error("Failed to mark read:", e);
    }

    if (action === "verify") {
        if (typeof showVerificationModal === 'function') {
            showVerificationModal(notif.alert_id);
        } else {
            try {
                showToast("Verifying", "Dispatching nearby units...", "info");
                const res = await fetchJSON(`/api/alerts/${notif.alert_id}/verify`, { method: "POST" });
                if (res && res.success) {
                    showToast("Verified", `Alert #${notif.alert_id} activated`, "success");
                    if (res.report_url) {
                        window.location.assign(res.report_url);
                        return;
                    }
                } else {
                    showToast("Verify Failed", (res && res.error) || "Unable to verify alert", "error");
                }
            } catch (err) {
                showToast("Error", err.message || "Could not verify report", "error");
            }
        }
    } else if (notif.lat && notif.lng) {
        // Fly to location
        if (window.map) {
            window.map.flyTo([notif.lat, notif.lng], 18, {
                animate: true,
                duration: 1.5
            });

            // Pulse effect
            const marker = L.circleMarker([notif.lat, notif.lng], {
                radius: 40,
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.3,
                weight: 2
            }).addTo(window.map);

            setTimeout(() => {
                if (window.map && marker) window.map.removeLayer(marker);
            }, 3000);
        }
    }
}

function updateTime() {
    const now = new Date();
    const target = document.getElementById("current-time");
    if (target) target.innerText = now.toLocaleTimeString();
}

function renderMapData() {
    unitLayer.clearLayers();
    alertLayer.clearLayers();
    actionLayer.clearLayers(); // Clear action layer (optimistic markers)
    zoneCircleLayer.clearLayers(); // Clear and redraw zones every refresh
    routeLayer.clearLayers(); // Clear routes

    state.waterSources.forEach(w => {
       if (!w.lat || !w.lng) return;
        const waterIcon = L.divIcon({

            html: `
                <div class="custom-premium-marker" style="--marker-color: #0ea5e9">
                    <div class="marker-pin"></div>
                    <div class="marker-icon">\uD83D\uDCA7</div>
                </div>
            `,
            className: 'chlef-premium-icon',
            iconSize: [35, 35],
            iconAnchor: [17, 35],
            popupAnchor: [0, -30]
        });
        L.marker([w.lat, w.lng], { icon: waterIcon }).addTo(map).bindPopup(`
            <div class="premium-popup">
                <h4 style="margin:0; color:#0ea5e9">${w.name}</h4>
                <p style="margin:5px 0 0; font-size:0.8rem; color:#64748b">Source d'eau / Point tactique</p>
                <div style="margin-top:8px; border-top:1px solid #e2e8f0; padding-top:8px; font-size:0.75rem;">
                    Capacit: <span style="color:#0ea5e9; font-weight:600;">${w.capacity || 'N/A'}</span>
                </div>
            </div>
        `);
    });

    state.units.forEach((unit) => {
         if (!unit.lat || !unit.lng) return;
        let iconChar = "\uD83C\uDFE0";
        let iconColor = "#ef4444";
        const name = (unit.name || "").toLowerCase();

        if (name.includes("marine")) {
            iconChar = "\u2693";
            iconColor = "#0ea5e9";
        } else if (name.includes("vigie")) {
            iconChar = "\uD83D\uDDFC";
            iconColor = "#f59e0b";
        } else if (name.includes("poste avanc") || name.includes("p.s.r") || name.includes("secteur")) {
            iconColor = "#f97316";
        }

        const stationIcon = L.divIcon({
            html: `
                <div class="custom-premium-marker" style="--marker-color: ${iconColor}">
                    <div class="marker-pin"></div>
                    <div class="marker-icon">${iconChar}</div>
                </div>
            `,
            className: 'chlef-premium-icon',
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -35]
        });

        L.marker([unit.lat, unit.lng], { icon: stationIcon })
            .bindPopup(`
                <div class="premium-popup">
                    <h4 style="margin:0; color:${iconColor}">${unit.name}</h4>
                    <p style="margin:5px 0 0; font-size:0.8rem; color:#64748b">Status: <span style="color:#16a34a; font-weight:600;"> ${String(unit.status || 'OPERATIONAL').toUpperCase()}</span></p>
                    <div style="margin-top:8px; border-top:1px solid #e2e8f0; padding-top:8px; font-size:0.75rem; color:#475569;">
                        Secteur: Protection Civile Algrienne
                    </div>
                </div>
            `)
            .on('click', (e) => {
                if (typeof fetchAndDisplayWeather === "function") {
                    fetchAndDisplayWeather(unit.lat, unit.lng);
                }
            })
            .addTo(unitLayer);
    });

    state.zones.forEach((z) => {
        if (!z.center_lat || !z.center_lng) return;
        const risk = (z.risk_level || "medium").toLowerCase();
        const color = risk === "high" ? "#ef4444" : risk === "low" ? "#22c55e" : "#f59e0b";
        const hazardIcon = z.hazard_type === "Chemical Storage" ? "\uD83E\uDDEA" : z.hazard_type === "Fuel Tank" ? "\u26FD" : z.hazard_type === "Forest" ? "🌳" : z.hazard_type === "Industrial" ? "🏭" : "\uD83C\uDFED";
        
        const circle = L.circle([z.center_lat, z.center_lng], {
            radius: Math.sqrt(z.area_ha || 45) * 50,
            color: color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.15,
            dashArray: risk === "high" ? "5, 10" : "none"
        }).addTo(zoneCircleLayer); 

        const zoneMarkerIcon = L.divIcon({
            html: `
                <div class="custom-premium-marker" style="--marker-color: ${color}">
                    <div class="marker-pin"></div>
                    <div class="marker-icon">${hazardIcon}</div>
                </div>
            `,
            className: 'chlef-premium-icon',
            iconSize: [35, 35],
            iconAnchor: [17, 35],
            popupAnchor: [0, -30]
        });

        const zoneMarker = L.marker([z.center_lat, z.center_lng], { icon: zoneMarkerIcon }).addTo(zoneCircleLayer);

        circle.on('click', (e) => {
            if (typeof fetchAndDisplayWeather === "function") {
                fetchAndDisplayWeather(z.center_lat, z.center_lng);
            }
        });
        zoneMarker.on('click', (e) => {
            if (typeof fetchAndDisplayWeather === "function") {
                fetchAndDisplayWeather(z.center_lat, z.center_lng);
            }
        });

        const popupHtml = `
            <div style="
                min-width: 320px;
                padding: 16px;
                background: #0f172a;
                border-radius: 12px;
                color: #fff;
                font-family: 'Inter', sans-serif;
                box-sizing: border-box;
            ">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:12px;">
                    <div style="width:12px; height:12px; border-radius:50%; background:${color}; flex-shrink:0;"></div>
                    <span style="font-weight:800; font-size:1.1rem; color:${color};">${z.name}</span>
                    <span style="margin-left:auto; background:${color}22; border:1px solid ${color}55; color:${color}; font-size:0.65rem; font-weight:700; padding:2px 8px; border-radius:20px; letter-spacing:1px;">${risk.toUpperCase()}</span>
                </div>
                <!-- WEATHER INFO (DEDICATED FULL-WIDTH PILL) -->
                <div class="weather-quick-pill" id="header-weather-pill" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; background: rgba(167, 139, 250, 0.1); border: 1px solid rgba(167, 139, 250, 0.2); padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; width: 100%; box-sizing: border-box;">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <span id="pill-temp" style="font-weight: 700;">🌡️ --°C</span>
                        <span id="pill-wind" style="font-weight: 700;">💨 -- km/h</span>
                        <span id="pill-rain" style="font-weight: 700;">🌧️ -- mm/h</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
                        <span id="pill-location" style="font-weight: 800; color: #a78bfa; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 10px;">📍 Select Location</span>
                        <button class="pill-refresh-btn" onclick="refreshWeather()" title="Refresh Weather" style="background: transparent; border: none; cursor: pointer; font-size: 1.1rem; padding: 0;">🔄</button>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.82rem;">
                    <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                        <div style="color:#888; font-size:0.7rem; margin-bottom:4px;"> AREA</div>
                        <div style="font-weight:700; color:#fff;">${z.area_ha} ha</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                        <div style="color:#888; font-size:0.7rem; margin-bottom:4px;">\u23F1\uFE0F DOMINO z</div>
                        <div style="font-weight:700; color:#fbbf24;">${z.domino_threshold} min</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                        <div style="color:#888; font-size:0.7rem; margin-bottom:4px;">${hazardIcon} HAZARD</div>
                        <div style="font-weight:700; color:#f97316; font-size:0.75rem;">${z.hazard_type}</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                        <div style="color:#888; font-size:0.7rem; margin-bottom:4px;"> NEIGHBORS</div>
                        <div style="font-weight:700; color:#a78bfa;">${z.neighbors_count} Zones</div>
                    </div>
                </div>
                <div style="margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.08); font-size:0.72rem; color:#888;">
                     D(z) = (z)  max(0, A(z)  C(zz))  Eq. 4
                </div>
            </div>
        `;

        circle.bindPopup(popupHtml, { maxWidth: 380 });
        zoneMarker.bindPopup(popupHtml, { maxWidth: 380 });
    });

    state.alerts.forEach((alert) => {
        const status = (alert.status || "").toLowerCase();
        
        // If fire is resolved or extinguished, it's considered "OFF" (ytfa)
        // We skip drawing the flame icon.
        if (status === "resolved" || status === "extinguished" || status === "completed") {
            // Optional: Draw a subtle gray circle or just skip
            // skipping for "ytfa" effect
            return;
        }

        L.marker([alert.lat, alert.lng], {
            icon: L.divIcon({
                className: "fire-emoji",
                html: `<div class="incident-fire" style="--incident-color:${severityColor(alert.severity)}">🔥</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 20]
            })
        })
            .bindPopup(
                `<b>\uD83D\uDD25 #${alert.id} - ${alert.title}</b><br/>Severity: ${String(alert.severity || "-").toUpperCase()}<br/>Status: ${alert.status}<br/>Zone: ${alert.zone_name || "N/A"}`
            )
            .on('click', (e) => {
                if (typeof fetchAndDisplayWeather === "function") {
                    fetchAndDisplayWeather(alert.lat, alert.lng);
                }
            })
            .addTo(alertLayer);
    });
}

function setHiddenPanels() {
    // Hide all panels that have the base class
    document.querySelectorAll(".dashboard-panel-section").forEach((panel) => {
        panel.classList.add("hidden");
    });
}

function setMode(mode) {
    console.log("Switching to mode:", mode);
    state.currentMode = mode;
    document.querySelectorAll(".nav-btn, .nav-item-premium").forEach((btn) => btn.classList.remove("active"));

    const activeBtn = {
        dashboard: "btn-dashboard",
        report: "btn-report",
        unit: "btn-unit",
        reports: "btn-reports",
        analysis: "btn-analysis",
        estimates: "btn-estimates",
        optimization: "btn-optimization",
        users: "btn-users",
        scientific: "btn-scientific",
        duty: "btn-duty",
        scenario: "btn-scenario",
        maintenance: "btn-maintenance",
        ip: "btn-algo-ip",
        gp: "btn-algo-gp"
    }[mode];

    if (activeBtn) {
        const element = document.getElementById(activeBtn);
        if (element) element.classList.add("active");
    }

    const targetBtn = document.querySelector(`[data-section="${mode}"], [onclick*="setMode('${mode}')"]`);
    if (targetBtn) targetBtn.classList.add("active");

    setHiddenPanels();

    const mapEl = document.getElementById("map");
    const drawerHandle = document.querySelector(".drawer-handle");
    const viewToggle = document.getElementById("view-toggle");

    // ===== MAP VISIBILITY CONTROLLER =====
    const mapWrapper = document.getElementById("map-card-wrapper");
    const allowedMapModes = ["dashboard", "report", "equipment", "zones", "unit", "scenario", "maintenance"];
    
    if (allowedMapModes.includes(mode)) {
        if (mapWrapper) {
            mapWrapper.style.setProperty('display', 'block', 'important');
            mapWrapper.style.setProperty('visibility', 'visible', 'important');
        }
        if (mapEl) {
            mapEl.classList.remove("hidden");
            mapEl.style.setProperty('display', 'block', 'important');
            mapEl.style.setProperty('visibility', 'visible', 'important');
            mapEl.style.setProperty('opacity', '1', 'important');
            mapEl.style.setProperty('height', '339px', 'important');
        }
        drawerHandle?.classList.remove("hidden");
        drawerHandle?.style.setProperty('display', 'flex', 'important');
        viewToggle?.style.setProperty("display", "flex", "important");
    } else {
        if (mapWrapper) {
            mapWrapper.style.setProperty('display', 'none', 'important');
            mapWrapper.style.setProperty('visibility', 'hidden', 'important');
        }
        if (mapEl) {
            mapEl.classList.add("hidden");
            mapEl.style.setProperty('display', 'none', 'important');
            mapEl.style.setProperty('visibility', 'hidden', 'important');
        }
        drawerHandle?.classList.add("hidden");
        drawerHandle?.style.setProperty('display', 'none', 'important');
        viewToggle?.style.setProperty("display", "none", "important");
    }

    // Confirm button overlay - show only in report/unit modes
    const overlayContainer = document.getElementById("map-overlay-container");
    if (overlayContainer) {
        if (mode === "report" || mode === "unit") {
            overlayContainer.classList.remove("hidden");
            overlayContainer.style.display = "flex";
        } else {
            overlayContainer.classList.add("hidden");
            overlayContainer.style.display = "none";
        }
    }

    // Force Leaflet to recalculate map size
    setTimeout(() => {
        if (map) {
            map.invalidateSize({ animate: false, pan: false });
            map.getContainer().style.opacity = "1";
        }
    }, 150);
    setTimeout(() => {
        if (map) map.invalidateSize({ animate: false, pan: false });
    }, 450);

    // Panel visibility logic
    const panelId = {
        report: "panel-report",
        dashboard: "panel-placeholder",
        unit: "panel-unit",
        reports: "panel-reports",
        analysis: "panel-analysis",
        estimates: "panel-estimates",
        ip: "panel-ip",
        gp: "panel-gp",
        optimization: "panel-optimization",
        users: "user-management-panel",
        scientific: "panel-scientific",
        zones: "panel-zones",
        equipment: "panel-equipment",
        duty: "panel-duty",
        maintenance: "panel-maintenance",
        scenario: "panel-scenario"
    }[mode];

    if (mode === 'duty' && document.getElementById('admin-duty-user-select')) {
        loadFiremenForDuty();
    }

    if (mode === 'maintenance') {
        loadMaintenanceData();
    }

    if (mode === 'equipment') {
        loadAdminDashboardData();
    }

    if (mode === 'zones') {
        if (typeof loadWaterSources === 'function') loadWaterSources();
        if (typeof loadZonesTable === 'function') loadZonesTable();
    }

    if (panelId) {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.remove("hidden");
            panel.style.display = "block";
        }
        if (mode === "report") {
            fillReportDefaults();
            const instr = document.querySelector(".map-instruction");
            if (instr) instr.innerText = "Click map to set incident location";
        }
        if (mode === "reports") renderReportsTable(); // Force immediate render
        if (mode === "dashboard") {
            renderLiveInventory();
            clearPendingSelection();
        }
        if (mode === "unit") fillUnitDefaults();
        if (mode === "reports") renderReportsTable();
        if (mode === "analysis") renderAnalysis();
        if (mode === "estimates") renderEstimatesTable();
        if (mode === "users") loadUsers();
    }

    const overlay = document.getElementById("map-overlay");
    const instruction = document.getElementById("map-instruction");
    const confirmBtn = document.getElementById("map-confirm-btn");

    if (mode === "report" || mode === "unit") {
        overlay?.classList.remove("hidden");
        if (confirmBtn) {
            confirmBtn.classList.remove("visible");
            confirmBtn.textContent = mode === "report" ? "CONFIRM INCIDENT" : "DEPLOY UNIT";
            confirmBtn.className = mode === "report" ? "map-btn" : "map-btn blue";
        }
        if (instruction) {
            instruction.innerText = mode === "report" ? "CLICK MAP TO REPORT INCIDENT" : "CLICK MAP TO DEPLOY UNIT";
        }
    } else {
        overlay?.classList.add("hidden");
        if (pendingSelectionMarker) {
            map.removeLayer(pendingSelectionMarker);
            pendingSelectionMarker = null;
        }
    }

    if (mode === "report") {
        setTimeout(() => map.invalidateSize(), 100);
    }
}

window.setMode = setMode;

function fillUnitDefaults() {
    // Update target coords card
    const coordEl = document.getElementById('deploy-target-coords');
    if (coordEl && state.lastClickedLocation) {
        coordEl.textContent = `${state.lastClickedLocation.lat.toFixed(4)}, ${state.lastClickedLocation.lng.toFixed(4)}`;
    }

    // Compute totals
    const totalVehicles = state.equipment ? state.equipment.length : 0;
    const activeEl = document.getElementById('deploy-active-count');
    const vehicleEl = document.getElementById('deploy-vehicle-count');
    if (activeEl) activeEl.textContent = state.units.length;
    if (vehicleEl) vehicleEl.textContent = totalVehicles;

    renderDeployUnits(state.units);
}

function renderDeployUnits(units) {
    const grid = document.getElementById('deploy-units-grid');
    if (!grid) return;
    if (!units.length) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#555; padding:40px;">No stations found.</div>';
        return;
    }

    const target = state.lastClickedLocation;

    grid.innerHTML = units.map(u => {
        const unitEquipment = state.equipment.filter(e => e.unit_id === u.id);
        const totalV = unitEquipment.length;
        const dist = target ? haversineKm(target.lat, target.lng, u.lat, u.lng) : null;
        const eta = dist ? Math.max(1, Math.round((dist / 45) * 60)) : null;
        
        // Group by type for display
        const counts = {};
        unitEquipment.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
        
        const badges = Object.entries(counts).map(([type, count]) =>
            `<span style="background:rgba(255,255,255,0.08); color:#ccc; font-size:0.7rem; padding:2px 8px; border-radius:20px; margin:2px; display:inline-block;">${type} ${count}</span>`
        ).join('');

        const distBadge = dist != null
            ? `<span style="color:#f97316; font-size:0.75rem;">\uD83D\uDCCD ${dist.toFixed(1)} km  \u23F1\uFE0F ${eta} min</span>`
            : `<span style="color:#555; font-size:0.75rem;">\uD83D\uDCCD Select map location</span>`;

        return `
        <div class="dash-card" style="padding:18px; cursor:pointer; transition:all .2s; border:1px solid rgba(255,255,255,0.06);"
            onmouseover="this.style.borderColor='#f97316'; this.style.transform='translateY(-2px)'"
            onmouseout="this.style.borderColor='rgba(255,255,255,0.06)'; this.style.transform='none'"
            onclick="deployUnitToTarget(${u.id})">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <div>
                    <div style="font-weight:800; font-size:0.95rem; color:#fff;">\uD83D\uDE92 ${u.name}</div>
                    <div style="color:#888; font-size:0.72rem; margin-top:3px;">ID #${u.id}  ${totalV} vhicules</div>
                </div>
                <span style="background:rgba(34,197,94,0.15); color:#22c55e; font-size:0.65rem; font-weight:700;
                    padding:3px 10px; border-radius:20px; white-space:nowrap;">ACTIVE</span>
            </div>
            <div style="margin-bottom:10px;">${badges}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05);">
                ${distBadge}
                <button onclick="event.stopPropagation(); deployUnitToTarget(${u.id})"
                    style="background: linear-gradient(135deg,#f97316,#ea580c); color:#fff; border:none;
                        padding:6px 14px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;">
                    \uD83D\uDE80 DEPLOY
                </button>
            </div>
        </div>`;
    }).join('');
}

function filterDeployUnits(query) {
    const typeFilter = document.getElementById('deploy-filter-type')?.value || '';
    const q = (query || '').toLowerCase();
    const filtered = state.units.filter(u =>
        u.name.toLowerCase().includes(q) &&
        (typeFilter === '' || u.name.includes(typeFilter))
    );
    renderDeployUnits(filtered);
}

function deployUnitToTarget(unitId) {
    if (!state.lastClickedLocation) {
        showToast("No Target", "Click on the map to select a fire location first.", "warning");
        return;
    }
    const unit = state.units.find(u => u.id === unitId);
    if (!unit) return;

    const dist = haversineKm(state.lastClickedLocation.lat, state.lastClickedLocation.lng, unit.lat, unit.lng);
    const eta = Math.max(1, Math.round((dist / 45) * 60));

    showToast(
        `\uD83D\uDE92 ${unit.name}`,
        `En route! Distance: ${dist.toFixed(1)} km  ETA: ${eta} min`,
        "success"
    );

    function refreshWeather() {
    console.log("Refreshing weather...");
    const lat = state.lastClickedLocation ? state.lastClickedLocation.lat : 36.1653;
    const lon = state.lastClickedLocation ? state.lastClickedLocation.lng : 1.3345;
    fetchAndDisplayWeather(lat, lon);
    showToast("Weather Update", "Syncing real-time atmospheric data...", "info");
}
window.refreshWeather = refreshWeather;

    // Add line on map from unit to target
    if (typeof map !== 'undefined') {
        const target = state.lastClickedLocation;
        const line = L.polyline([[unit.lat, unit.lng], [target.lat, target.lng]], {
            color: '#f97316', weight: 3, dashArray: '8,6', opacity: 0.8
        });

        const unitMarker = L.marker([unit.lat, unit.lng], {
            icon: L.divIcon({ html: '\uD83D\uDE92', className: '', iconSize: [28, 28] })
        }).addTo(map).bindPopup(`<b>${unit.name}</b><br> ETA: ${eta} min`).openPopup();

        setTimeout(() => { map.removeLayer(line); map.removeLayer(unitMarker); }, 30000);
    }
}
window.deployUnitToTarget = deployUnitToTarget;
window.filterDeployUnits = filterDeployUnits;

function fillReportDefaults() {
    const latInput = document.getElementById("input-lat");
    const lngInput = document.getElementById("input-lng");
    const stationCountInput = document.getElementById("report-station-count");
    const rainInput = document.getElementById("report-rain-val");
    const weatherWidget = document.getElementById("weather-widget");

    if (latInput) latInput.value = state.lastClickedLocation ? state.lastClickedLocation.lat.toFixed(6) : "";
    if (lngInput) lngInput.value = state.lastClickedLocation ? state.lastClickedLocation.lng.toFixed(6) : "";

    // Real-time calculation on entry
    if (state.lastClickedLocation && state.units.length) {
        let bestDist = 999999;
        state.units.forEach(u => {
            const d = haversineKm(state.lastClickedLocation.lat, state.lastClickedLocation.lng, u.lat, u.lng);
            if (d < bestDist) bestDist = d;
        });
        const eta = Math.max(1, Math.round((bestDist / 45) * 60));
        showToast("Calcul Tactique", `: ${bestDist.toFixed(1)}  | : ${eta} `, "info");
    }
    if (stationCountInput) stationCountInput.value = String(state.units.length);

    const openInput = document.getElementById("summary-open-alerts");
    const dominoInput = document.getElementById("summary-high-domino");
    const etaInput = document.getElementById("summary-avg-eta");
    if (openInput) openInput.value = String(state.summary?.open_alerts ?? 0);
    if (dominoInput) dominoInput.value = String(state.summary?.high_domino_open ?? 0);
    if (etaInput) etaInput.value = `${Number(state.summary?.avg_active_eta_minutes ?? 0).toFixed(1)} min`;

    if (state.lastClickedLocation) {
        if (typeof fetchAndDisplayWeather === "function") {
            fetchAndDisplayWeather(state.lastClickedLocation.lat, state.lastClickedLocation.lng);
        }
    }

    const riskDisplay = document.getElementById("auto-risk-display");
    const openAlerts = state.alerts.filter((item) => (item.status || "").toLowerCase() === "open");
    const severityWeight = { low: 1, medium: 2, high: 3, critical: 4 };
    const averageSeverity = openAlerts.length
        ? openAlerts.reduce((sum, item) => sum + (severityWeight[(item.severity || "medium").toLowerCase()] || 2), 0) / openAlerts.length
        : 0;
    if (riskDisplay) {
        riskDisplay.value = averageSeverity >= 3.5
            ? "Critical Risk (Active severe incidents)"
            : averageSeverity >= 2.5
                ? "High Risk (Backend active alerts)"
                : averageSeverity >= 1.5
                    ? "Moderate Risk (Backend active alerts)"
                    : "Low Risk (No severe open alerts)";
    }

    if (weatherWidget) {
        weatherWidget.innerHTML = "";
        weatherWidget.classList.remove("active");
    }
}

function fillUnitDefaults() {
    const unitIdInput = document.getElementById("unit-id-input");
    const baseSelect = document.getElementById("unit-base-select");

    if (unitIdInput) unitIdInput.value = `UNIT-${Math.floor(Math.random() * 900 + 100)}`;
    if (baseSelect) {
        baseSelect.innerHTML = state.units
            .map((u) => `<option value="${u.id}">${u.name}</option>`)
            .join("");
    }
}

function renderReportsTable() {
    const tbody = document.getElementById("reports-table-body");
    if (!tbody) return;

    const rows = state.alerts.map((alert) => {
        const time = alert.created_at ? new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--";
        const coords = `${Number(alert.lat).toFixed(4)}, ${Number(alert.lng).toFixed(4)}`;
        const status = (alert.status || "Active").toUpperCase();
        const severity = (alert.severity || "MEDIUM").toUpperCase();
        
        return `
            <tr onclick="map.flyTo([${alert.lat}, ${alert.lng}], 18); setMode('dashboard');" style="cursor:pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <td style="padding:15px; font-weight:bold; color:var(--electric-blue);">#${alert.id}</td>
                <td style="padding:15px; font-family:'JetBrains Mono', monospace; font-size:0.85rem; color:rgba(255,255,255,0.5);">${time}</td>
                <td style="padding:15px; font-family:monospace; font-size:0.8rem; color:rgba(255,255,255,0.7);">${coords}</td>
                <td style="padding:15px;"><span style="color:${severityColor(alert.severity)}; font-weight:800; font-size:0.75rem; letter-spacing:1px; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:4px;">${severity}</span></td>
                <td style="padding:15px;"><span style="font-size:0.85rem; font-weight:600; color:${status === 'RESOLVED' ? '#4caf50' : '#ff9f43'};">${status}</span></td>
                <td style="padding:15px;">
                    <a href="/report/incident-pdf/${alert.id}" target="_blank" onclick="event.stopPropagation()" style="background: rgba(225,29,72,0.2); color: #e11d48; border: 1px solid #e11d48; padding: 4px 8px; border-radius: 4px; text-decoration: none; font-size: 0.75rem; font-weight: bold; display: inline-block;">📄 PDF</a>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = rows.length
        ? rows.join("")
        : `<tr><td colspan="5" style="padding:30px; text-align:center; color:rgba(255,255,255,0.2);">No mission history detected</td></tr>`;
}

function renderEstimatesTable() {
    const tbody = document.getElementById("estimates-table-body");
    if (!tbody) return;

    const grouped = new Map();
    state.dispatches.forEach((dispatch) => {
        if (!grouped.has(dispatch.alert_id)) grouped.set(dispatch.alert_id, []);
        grouped.get(dispatch.alert_id).push(dispatch);
    });

    const rows = Array.from(grouped.entries()).map(([alertId, items]) => {
        const car = items.find((x) => (x.equipment_type || "").toLowerCase().includes("ambulance"));
        const truck = items.find((x) => (x.equipment_type || "").toLowerCase().includes("ccf") || (x.equipment_type || "").toLowerCase().includes("cci"));
        const heli = items.find((x) => (x.equipment_type || "").toLowerCase().includes("heli"));
        const drone = items.find((x) => (x.equipment_type || "").toLowerCase().includes("drone"));

        let fallbackCar = "-", fallbackTruck = "-", fallbackHeli = "-", fallbackDrone = "-";

        if (items.length > 0) {
            const first = items[0];
            let speed = 45; // Base speed for truck/ambulance
            const ft = (first.equipment_type || "").toLowerCase();
            if (ft.includes("heli")) speed = 220;
            else if (ft.includes("drone")) speed = 80;

            // distance_km = (eta_minutes * speed) / 60
            const dist = (Number(first.eta_minutes) * speed) / 60;

            fallbackCar = (dist / 45 * 60).toFixed(1);
            fallbackTruck = (dist / 45 * 60).toFixed(1);
            fallbackHeli = (dist / 220 * 60).toFixed(1);
            fallbackDrone = (dist / 80 * 60).toFixed(1);
        }

        return `
            <tr>
                <td>ID-${alertId}</td>
                <td>${car ? Number(car.eta_minutes).toFixed(1) : fallbackCar}</td>
                <td>${truck ? Number(truck.eta_minutes).toFixed(1) : fallbackTruck}</td>
                <td>${heli ? Number(heli.eta_minutes).toFixed(1) : fallbackHeli}</td>
                <td>${drone ? Number(drone.eta_minutes).toFixed(1) : fallbackDrone}</td>
            </tr>
        `;
    });

    tbody.innerHTML = rows.length
        ? rows.join("")
        : `<tr><td colspan="5" style="padding:12px;">No dispatches yet</td></tr>`;
}

function haversineKm(aLat, aLng, bLat, bLng) {
    const radius = 6371;
    const dLat = (bLat - aLat) * Math.PI / 180;
    const dLng = (bLng - aLng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function renderLiveInventory() {
    const container = document.getElementById("inventory-container");
    if (!container) return;
    
    container.innerHTML = '<p style="color: #aaa; padding: 10px;">Loading live inventory from units...</p>';
    
    try {
        const data = await fetchJSON("/api/live_inventory");
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="color: #aaa; padding: 10px;">No inventory data available yet.</p>';
            return;
        }
        
        let html = '';
        data.forEach(unit => {
            let eqHtml = '';
            unit.equipment.forEach(eq => {
                const color = eq.available > 0 ? '#4caf50' : '#f44336';
                const statusStr = eq.available === 0 ? ' (Depleted)' : '';
                eqHtml += `
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding: 6px 0;">
                        <span style="font-size: 0.9em;">- ${eq.type}</span>
                        <strong style="color: ${color}; font-size: 0.9em;">
                            ${eq.available} / ${eq.total} ${statusStr}
                        </strong>
                    </div>
                `;
            });
            
            html += `
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px;">
                    <h4 style="margin: 0 0 10px 0; color: #ffeb3b; font-size: 1rem;"> ${unit.unit_name}</h4>
                    <div>${eqHtml}</div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (err) {
        console.error("Failed to load inventory", err);
        container.innerHTML = '<p style="color: #f44336; padding: 10px;">Error loading inventory. Please try again later.</p>';
    }
}

function renderAnalysis() {
    const openAlerts = state.alerts.filter((alert) => (alert.status || "").toLowerCase() === "open");
    const busyEquipment = state.equipment.filter((item) => (item.status || "").toLowerCase() === "busy").length;
    const totalEquipment = state.equipment.length || 1;
    const busyRatio = busyEquipment / totalEquipment;
    const severityWeight = { low: 1, medium: 2, high: 3, critical: 4 };
    
    let maxSeverity = 0;
    let sumSeverity = 0;
    openAlerts.forEach((item) => {
        let w = severityWeight[(item.severity || "medium").toLowerCase()] || 2;
        sumSeverity += w;
        if (w > maxSeverity) maxSeverity = w;
    });
    
    const averageSeverity = openAlerts.length ? sumSeverity / openAlerts.length : 0;

    const rainInput = document.getElementById("analysis-rain");
    const windInput = document.getElementById("analysis-wind");
    const riskBox = document.getElementById("analysis-risk-box");
    const prediction = document.getElementById("analysis-prediction");
    const nearestInput = document.getElementById("analysis-nearest");
    const distanceInput = document.getElementById("analysis-distance");
    const etaInput = document.getElementById("analysis-eta");
    const priorityInput = document.getElementById("analysis-priority");

    // Dynamic Weather Simulation based on average severity / season
    let simWind = 10;
    let simRain = 15;
    
    if (openAlerts.length > 0) {
        simWind = Math.round(15 + (averageSeverity * 12) + (Math.random() * 5)); 
        simRain = Math.max(0, Math.round(10 - (averageSeverity * 4) + (Math.random() * 2))); 
    } else {
        simWind = Math.round(10 + Math.random() * 8);
        simRain = Math.round(5 + Math.random() * 10);
    }

    if (rainInput) rainInput.value = `${simRain} mm`;
    if (windInput) windInput.value = `${simWind} km/h`;

    // Make Risk more responsive: Base it on the MAXIMUM severity currently active + equipment ratio
    let riskScore = (maxSeverity * 20) + (busyRatio * 40);
    if (openAlerts.length === 0) riskScore = 0;

    let riskLabel = "LOW";
    let riskColor = "#10b981"; // green

    if (riskScore >= 75 || maxSeverity === 4) {
        riskLabel = "CRITICAL";
        riskColor = "var(--crimson)";
    } else if (riskScore >= 55 || maxSeverity === 3) {
        riskLabel = "HIGH";
        riskColor = "#f97316"; // orange
    } else if (riskScore >= 35 || maxSeverity === 2) {
        riskLabel = "MEDIUM";
        riskColor = "var(--solar-yellow)"; // yellow
    }

    if (riskBox) {
        riskBox.innerText = riskLabel;
        riskBox.style.color = riskColor;
        riskBox.style.borderColor = riskColor;
    }
    if (prediction) {
        prediction.innerText = `Open alerts: ${openAlerts.length} | Busy equipment: ${busyEquipment}/${totalEquipment}`;
    }

    if (state.lastClickedLocation && state.units.length) {
        let bestUnit = state.units[0];
        let bestDistance = haversineKm(state.lastClickedLocation.lat, state.lastClickedLocation.lng, bestUnit.lat, bestUnit.lng);

        state.units.slice(1).forEach((unit) => {
            const distance = haversineKm(state.lastClickedLocation.lat, state.lastClickedLocation.lng, unit.lat, unit.lng);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestUnit = unit;
            }
        });

        const eta = Math.max(1, Math.round((bestDistance / 45) * 60));
        if (nearestInput) nearestInput.value = bestUnit.name;
        if (distanceInput) distanceInput.value = `${bestDistance.toFixed(1)} km`;
        if (etaInput) etaInput.value = `~${eta} min`;
    } else {
        if (nearestInput) nearestInput.value = "-";
        if (distanceInput) distanceInput.value = "-";
        if (etaInput) etaInput.value = "-";
    }

    if (priorityInput) {
        priorityInput.value = riskLabel;
        priorityInput.style.color = riskColor;
    }
    
    // Get actual requirements from the backend instead of frontend estimates
    let cars = 0, trucks = 0, helis = 0, drones = 0;
    if (state.summary && state.summary.requirements) {
        cars = state.summary.requirements.cars;
        trucks = state.summary.requirements.trucks;
        helis = state.summary.requirements.helis;
        drones = state.summary.requirements.drones;
    }

    const setValue = (id, value) => {
        const input = document.getElementById(id);
        if (input) input.value = `${value} Units`;
    };

    setValue("calc-cars", cars);
    setValue("calc-trucks", trucks);
    setValue("calc-helis", helis);
    setValue("calc-drones", drones);
}

function renderSummaryPanel() {
    const openInput = document.getElementById("summary-open-alerts");
    const dominoInput = document.getElementById("summary-high-domino");
    const etaInput = document.getElementById("summary-avg-eta");
    const affectedInput = document.getElementById("input-affected");
    const stationInput = document.getElementById("report-station-count");

    if (openInput) openInput.value = String(state.summary?.open_alerts ?? 0);
    if (dominoInput) dominoInput.value = String(state.summary?.high_domino_open ?? 0);
    if (etaInput) etaInput.value = `${Number(state.summary?.avg_active_eta_minutes ?? 0).toFixed(1)} min`;
    
    // Update the casualty estimate across all open alerts
    if (affectedInput) affectedInput.value = String(state.summary?.total_affected ?? 0);
    // Update the total stations count globally
    if (stationInput) stationInput.value = String(state.summary?.total_stations ?? 0);
}

/**
 * Emergency: Resolve all active fires and reset system state
 */
async function triggerTacticalReset() {
    if (!confirm("⚠️ TACTICAL RESET: This will extinguish ALL active fires and return ALL units to base. Are you sure?")) {
        return;
    }

    try {
        const res = await fetchJSON("/api/alerts/resolve-all", { method: "POST" });
        if (res.success) {
            showToast("System Reset", "All icons cleared. Monitoring resumed.", "success");
            await refreshData();
        } else {
            showToast("Reset Failed", res.error || "Action unauthorized", "error");
        }
    } catch (err) {
        showToast("Error", "Server sync failed", "error");
    }
}

function setupAlgorithmButtons() {
    const buttons = document.querySelectorAll("#algorithm-toggle-group .algo-btn");
    const hiddenAlgorithmInput = document.getElementById("input-algorithm");
    if (!buttons.length || !hiddenAlgorithmInput) return;

    const syncButtons = () => {
        buttons.forEach((btn) => {
            const algo = btn.getAttribute("data-algo");
            btn.classList.toggle("active", algo === state.selectedAlgorithm);
        });
    };

    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            const selected = button.getAttribute("data-algo") || "ga";
            state.selectedAlgorithm = selected;
            hiddenAlgorithmInput.value = selected;
            syncButtons();
            showToast("Algorithm", `Selected: ${selected.toUpperCase()}`, "info");
        });
    });

    syncButtons();
}

async function runAlgorithmComparison() {
    const resultBox = document.getElementById("analysis-algo-result");
    if (!state.lastClickedLocation) {
        if (resultBox) resultBox.value = "Click on map first to select incident location";
        showToast("Comparison", "Pick a location on the map first", "warning");
        return;
    }

    const severity = (document.getElementById("input-severity")?.value || "Medium").toLowerCase();

    try {
        const [gaResult, hybridResult] = await Promise.all([
            fetchJSON("/api/dispatch/preview", {
                method: "POST",
                body: JSON.stringify({
                    lat: state.lastClickedLocation.lat,
                    lng: state.lastClickedLocation.lng,
                    severity,
                    algorithm: "ga"
                })
            }),
            fetchJSON("/api/dispatch/preview", {
                method: "POST",
                body: JSON.stringify({
                    lat: state.lastClickedLocation.lat,
                    lng: state.lastClickedLocation.lng,
                    severity,
                    algorithm: "hybrid_pso_gwo"
                })
            })
        ]);

        const gaEta = gaResult.nearest_unit ? Number(gaResult.nearest_unit.eta_minutes) : Number.POSITIVE_INFINITY;
        const hybridEta = hybridResult.nearest_unit ? Number(hybridResult.nearest_unit.eta_minutes) : Number.POSITIVE_INFINITY;
        const winner = gaEta <= hybridEta ? "GA" : "HYBRID PSO-GWO";

        if (resultBox) {
            resultBox.value = `Winner: ${winner} | GA ETA: ${Number.isFinite(gaEta) ? gaEta.toFixed(1) : "N/A"} min | Hybrid ETA: ${Number.isFinite(hybridEta) ? hybridEta.toFixed(1) : "N/A"} min`;
        }
        showToast("Comparison Complete", `Best optimizer: ${winner}`, "success");
    } catch (error) {
        if (resultBox) resultBox.value = "Comparison failed. Check backend connectivity.";
        showToast("Comparison Error", String(error?.message || "Unknown error"), "error");
    }
}

async function submitIncident() {
    console.log("Submit Incident Triggered");
    
    // Auto-fill latitude/longitude if missing from current lastClickedLocation
    if (!state.lastClickedLocation) {
        const latVal = document.getElementById("input-lat")?.value;
        const lngVal = document.getElementById("input-lng")?.value;
        if (latVal && lngVal && !isNaN(parseFloat(latVal)) && !isNaN(parseFloat(lngVal))) {
            state.lastClickedLocation = { lat: parseFloat(latVal), lng: parseFloat(lngVal) };
        }
    }

    if (!state.lastClickedLocation) {
        showToast("Operation Incomplete", "Please mark incident location on map", "warning");
        return;
    }

    const areaType = document.getElementById("input-area")?.value || "General";
    const severity = (document.getElementById("input-severity")?.value || "Medium").toLowerCase();
    const affected = document.getElementById("input-affected")?.value || "0";
    const zone = document.getElementById("input-zone")?.value || "General";
    const status = document.getElementById("input-status")?.value || "Active";
    const algorithm = state.selectedAlgorithm || document.getElementById("input-algorithm")?.value || "ga";

    const payload = {
        title: `Fire Incident [${areaType}]`,
        severity,
        lat: state.lastClickedLocation.lat,
        lng: state.lastClickedLocation.lng,
        description: `Affected:${affected} | Zone:${zone} | Status:${status}`,
        area_type: areaType,
        algorithm
    };
    
    console.log("Submitting Payload:", payload);

    if (!navigator.onLine) {
        const queued = queueOfflineIncident(payload);
        showToast("Offline Mode", `Alert saved locally (queue: ${queued})`, "warning");
        clearPendingSelection("Offline saved. Will auto-send when internet is back.");
        return;
    }

    const optimisticMarker = L.marker([payload.lat, payload.lng], {
        icon: L.divIcon({
            className: "fire-emoji",
            html: `<div class="incident-fire" style="--incident-color:${severityColor(payload.severity)}; opacity: 0.7;">🔥</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 21]
        })
    }).addTo(actionLayer);

    try {
        const created = await fetchJSON("/api/alerts", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (created.duplicate) {
            showToast("Duplicate Alert", "This incident is already open nearby", "warning");
        } else {
            showToast("Incident Reported", `Dispatch assigned: ${created.dispatch_count} via ${(created.algorithm_used || "ga").toUpperCase()}`, "success");

            // --- ANIMATION START ---
            if (created.dispatch_count > 0) {
                // We need the dispatch details to know which units are moving
                // If they aren't in the 'created' object, we might need to wait for next refresh
                // But usually we want immediate feedback.
                // Assuming 'created.dispatches' exists or we refresh dispatches here.
                
                // For now, let's refresh dispatches then animate
                fetchJSON("/api/dispatches").then(dispatches => {
                    state.dispatches = dispatches || [];
                    visualizeUnitMovement(payload.lat, payload.lng);
                });
            }
            // --- ANIMATION END ---

            const reportedAlert = created.alert;
            if (reportedAlert) {
                const marker = L.marker([reportedAlert.lat, reportedAlert.lng], {
                    icon: L.divIcon({
                        className: "fire-emoji",
                        html: `<div class="incident-fire" style="--incident-color:${severityColor(reportedAlert.severity)}">🔥</div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 21]
                    })
                })
                    .addTo(actionLayer)
                    .bindPopup(
                        `<b>\uD83D\uDD25 INCIDENT REPORTED</b><br/>#${reportedAlert.id}<br/>Type: ${areaType}<br/>Zone: ${zone}<br/>Severity: ${String(reportedAlert.severity || "-").toUpperCase()}<br/>Status: ${reportedAlert.status || status}<br/>Trapped: ${affected}`
                    )
                    .on('click', (e) => {
                        if (typeof fetchAndDisplayWeather === "function") {
                            fetchAndDisplayWeather(reportedAlert.lat, reportedAlert.lng);
                        }
                    })
                    .addTo(actionLayer);
            }

            if (created && created.alert && created.alert.id) {
                if ((created.dispatch_count || 0) > 0 || (created.dispatches && created.dispatches.length > 0)) {
                    window.location.assign(`/station-resource-report/${created.alert.id}`);
                    return;
                }

                showToast("Incident Reported", "Incident logged. Waiting for verification before dispatching units.", "info");
            }

            if (created && created.dispatches && created.dispatches.length > 0) {
                showDispatchSummaryModal(created.dispatches);
            }
        }

        await refreshData();
        
        // Automatically run scientific benchmark for the new incident
        if (state.currentMode === "analysis" || state.currentMode === "dashboard" || state.currentMode === "reports") {
            runAlgorithmComparison(payload.lat, payload.lng, payload.severity, payload.area_type);
        }

        clearPendingSelection("Incident Reported. Ready for next.");
    } catch (error) {
        actionLayer.removeLayer(optimisticMarker);
        const message = String(error?.message || "");
        if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
            const queued = queueOfflineIncident(payload);
            showToast("Offline Mode", `Connection lost. Saved locally (queue: ${queued})`, "warning");
            clearPendingSelection("Offline saved. Will auto-send when internet is back.");
            return;
        }
        showToast("Error", `Could not submit incident: ${message}`, "error");
    }
}

async function showDispatchSummaryModal(dispatches) {
    const modal = document.getElementById("dispatch-modal");
    const content = document.getElementById("dispatch-report-content");
    const areaType = document.getElementById('input-area')?.value || 'Urban';
    if(!modal || !content) return;

    if (!dispatches || dispatches.length === 0) {
        content.innerHTML = `<div style="text-align:center; padding:20px;">
            <p style="font-size:1.2rem; color:#ffeb3b;"> ALERT LOGGED</p>
            <p style="color:#aaa;">No units were dispatched automatically. Please assign resources manually from the Tactical Panel.</p>
        </div>`;
        modal.style.display = "flex";
        return;
    }

    const totalDistance = dispatches.length > 0 ? dispatches[0].distance_km : 0;
    const totalTime = dispatches.length > 0 ? dispatches[0].eta_minutes : 0;

    let tacticalHtml = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; text-align: center;">
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; border-top: 2px solid #3b82f6;">
                <div style="font-size: 0.7rem; color: #aaa;">AREA TYPE</div>
                <div style="font-weight: 800; color: #fff;">${areaType.toUpperCase()}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; border-top: 2px solid #f97316;">
                <div style="font-size: 0.7rem; color: #aaa;">DISTANCE</div>
                <div style="font-weight: 800; color: #fff;">${totalDistance} KM</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; border-top: 2px solid #22c55e;">
                <div style="font-size: 0.7rem; color: #aaa;">EST. ETA</div>
                <div style="font-weight: 800; color: #fff;">${totalTime} MIN</div>
            </div>
        </div>
    `;

    const deployedByUnit = {}; 
    dispatches.forEach(d => {
        if(!deployedByUnit[d.unit_id]) deployedByUnit[d.unit_id] = { name: d.unit_name, deployed: [] };
        deployedByUnit[d.unit_id].deployed.push(d.type);
    });

    content.innerHTML = tacticalHtml + '<p style="color: #aaa; text-align:center;">Synchronizing tactical logs...</p>';
    modal.style.display = "flex";

    try {
        const response = await fetch("/api/live_inventory");
        const inventory = await response.json();

        let html = tacticalHtml;
        for (const [uid, info] of Object.entries(deployedByUnit)) {
            const unitInv = inventory.find(i => String(i.unit_id) === uid);
            
            let eqHtml = "";
            let leftCount = 0;
            if (unitInv) {
                unitInv.equipment.forEach(eq => {
                    const color = eq.available > 0 ? '#4caf50' : '#f44336';
                    leftCount += eq.available;
                    eqHtml += `<div style="margin-left: 15px; font-size: 0.85em; padding: 2px 0;">
                         ${eq.type}: <strong style="color: ${color}">${eq.available} Left</strong> <span style="color: #666; font-size: 0.9em;">(out of ${eq.total})</span>
                    </div>`;
                });
            }

            const deployedList = info.deployed.map(t => `<span style="background: var(--primary); color: black; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8em; margin-right: 5px; display: inline-block; margin-bottom: 4px;">${t}</span>`).join("");

            html += `
            <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                <h4 style="margin: 0 0 8px 0; font-size: 1.1em; color: #fff;"> ${info.name}</h4>
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 0.85em; color: #aaa; margin-bottom: 4px;">Dispatched Equipment (${info.deployed.length}):</div>
                    ${deployedList}
                </div>
                <div>
                    <div style="font-size: 0.85em; color: #aaa; margin-bottom: 4px;">Remaining Base Inventory (${leftCount} total items available):</div>
                    ${eqHtml}
                </div>
            </div>
            `;
        }
        content.innerHTML = html;
    } catch(e) {
        content.innerHTML = `<p style="color: #f44336;">Failed to load inventory update.</p>`;
    }
}

function deployUnit() {
    if (!state.lastClickedLocation) {
        showToast("Operation Incomplete", "Please select target location first", "warning");
        return;
    }

    const unitID = `UNIT-${Math.floor(Math.random() * 900 + 100)}`;
    const selectedType = document.getElementById("unit-type-select")?.value || "Fire Truck";
    const typeValue = selectedType.toLowerCase();
    const unitEmoji = typeValue.includes("helicopter") ? "" : 
                      (typeValue.includes("drone") ? "" : 
                      (typeValue.includes("ambulance") ? "" : "\uD83D\uDE92"));
    const unitClass = typeValue.includes("helicopter") ? "incident-heli" : 
                      typeValue.includes("drone") ? "incident-drone" : "incident-unit";
    state.localIncidents.unshift({
        id: Date.now(),
        type: selectedType,
        title: `${selectedType} Deployed [${unitID}]`,
        lat: state.lastClickedLocation.lat,
        lng: state.lastClickedLocation.lng,
        severity: "n/a",
        status: "En Route"
    });

    L.marker([state.lastClickedLocation.lat, state.lastClickedLocation.lng], {
        icon: L.divIcon({
            html: `<div class="${unitClass}">${unitEmoji}</div>`,
            className: "unit-emoji",
            iconSize: [24, 24]
        })
    })
        .addTo(map)
        .bindPopup(`<b>${unitEmoji} ${selectedType} Deployed</b><br/>ID: ${unitID}<br/>Status: En Route`);

    showToast("Unit Deployed", `${selectedType} ${unitID} is en-route`, "info");

    const confirmBtn = document.getElementById("map-confirm-btn");
    if (confirmBtn) confirmBtn.classList.remove("visible");
    const instruction = document.querySelector(".map-instruction");
    if (instruction) instruction.innerText = "Unit deployed. Ready for next.";
    if (pendingSelectionMarker) {
        map.removeLayer(pendingSelectionMarker);
        pendingSelectionMarker = null;
    }
}

let trendChart = null;
let equipmentChart = null;

function initCharts() {
    const ctx1 = document.getElementById('trendChart');
    if (ctx1 && !trendChart) {
        trendChart = new Chart(ctx1, {
            type: 'line',
            data: { 
                labels: ['08:00', '12:00', '16:00', '20:00', '00:00'], 
                datasets: [
                    { 
                        label: 'Incidents Active', 
                        data: [2, 5, 3, 8, 4], 
                        borderColor: '#ef4444', 
                        fill: true, 
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        tension: 0.5,
                        borderWidth: 4,
                        pointRadius: 5,
                        pointBackgroundColor: '#ef4444',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    },
                    { 
                        label: 'Prediction Curve', 
                        data: [1, 3, 5, 12, 18], 
                        borderColor: '#fbbf24', 
                        borderDash: [5, 5],
                        fill: false, 
                        tension: 0.5,
                        borderWidth: 2,
                        pointRadius: 0
                    }
                ] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { 
                        display: true,
                        labels: { color: '#aaa', font: { size: 10 } }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#ccc',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1
                    }
                }, 
                scales: { 
                    y: { 
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#666' }
                    }, 
                    x: { 
                        grid: { display: false }, 
                        ticks: { color: '#666' } 
                    } 
                } 
            }
        });
    }

    const ctx2 = document.getElementById('equipmentChart');
    if (ctx2 && !equipmentChart) {
        equipmentChart = new Chart(ctx2, {
            type: 'doughnut',
            data: { 
                labels: ['Available', 'Busy'], 
                datasets: [{ 
                    data: [1, 0], 
                    backgroundColor: ['#00ff88', '#ef4444'], 
                    borderWidth: 0,
                    hoverOffset: 4
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                cutout: '80%', 
                plugins: { 
                    legend: { 
                        position: 'bottom', 
                        labels: { color: '#aaa', padding: 10, font: { size: 10 } } 
                    } 
                } 
            }
        });
    }
}

function updateCharts() {
    if (trendChart && state.alerts) {
        const counts = [0, 0, 0, 0, 0];
        const now = new Date();
        
        // Filter: ONLY count alerts that are NOT resolved or extinguished
        // This makes the "Mission Pulse" reflect reality when a fire is put out.
        const activeAlerts = state.alerts.filter(a => 
            !['resolved', 'extinguished', 'completed'].includes((a.status || '').toLowerCase())
        );

        activeAlerts.forEach(a => {
            const diff = (now - new Date(a.created_at)) / 3600000;
            if (diff < 4) counts[4]++;
            else if (diff < 8) counts[3]++;
            else if (diff < 12) counts[2]++;
            else if (diff < 16) counts[1]++;
            else if (diff < 24) counts[0]++;
        });
        
        trendChart.data.datasets[0].data = counts;
        
        // Dynamic Prediction Curve (Simulated)
        const prediction = counts.map(v => Math.round(v * 1.5 + Math.random() * 2));
        trendChart.data.datasets[1].data = prediction;
        
        trendChart.update('none');
    }
    if (equipmentChart && state.summary) {
        const busy = state.summary.busy_equipment || 0;
        const total = (state.units && state.units.length) || 10;
        const avail = Math.max(0, total - busy);
        equipmentChart.data.datasets[0].data = [avail, busy];
        equipmentChart.update('none');
    }
}

async function refreshData() {
    try {
        const [alerts, units, equipment, zones, dispatches, summary, waterSources, activity] = await Promise.all([
            fetchJSON("/api/alerts").catch(e => { console.error(e); return []; }),
            fetchJSON("/api/units").catch(e => { console.error(e); return []; }),
            fetchJSON("/api/equipment").catch(e => { console.error(e); return []; }),
            fetchJSON("/api/zones").catch(e => { console.error(e); return []; }),
            fetchJSON("/api/dispatches").catch(e => { console.error(e); return []; }),
            fetchJSON("/api/summary").catch(e => { console.error(e); return null; }),
            fetchJSON("/api/water").catch(e => { console.error(e); return []; }),
            fetchJSON("/api/activity").catch(e => { console.error(e); return []; })
        ]);

        state.alerts = alerts || [];
        state.units = units || [];
        state.equipment = equipment || [];
        state.zones = zones || [];
        state.dispatches = dispatches || [];
        state.summary = summary;
        state.waterSources = waterSources || [];
        state.activity = activity || [];

        // --- NEW: Update Admin Dashboard Stat Cards ---
        const stationsCount = document.getElementById('stat-stations-count');
        const equipmentCount = document.getElementById('stat-equipment-count');
        const firesCount = document.getElementById('stat-fires-count');
        const waterCount = document.getElementById('stat-water-count');

        if (stationsCount) stationsCount.innerText = state.units.length;
        if (equipmentCount) equipmentCount.innerText = state.equipment.length;
        if (firesCount) {
            // UPDATED: Only count active/open fires to show reality (mtb9ach ch3ela)
            const activeFires = state.alerts.filter(a => 
                ['open', 'active', 'new', 'contained'].includes((a.status || "").toLowerCase())
            );
            firesCount.innerText = activeFires.length;
        }
        if (waterCount) waterCount.innerText = state.waterSources.length;

        renderMapData();
        renderSummaryPanel();
        renderUserActivity();
        renderReportsTable(); // Always render so data is ready
        if (state.currentMode === "reports") {
            // No need to call it again, but could force a refresh
        }
        if (state.currentMode === "estimates") renderEstimatesTable();
        if (state.currentMode === "analysis") renderAnalysis();
        if (state.currentMode === "dashboard") {
            renderLiveInventory();
            updateCharts();
            renderTacticalMissions();
            renderDashboardWidgets();
            // Update admin dashboard if on admin role
            if (document.body.innerHTML.includes('admin')) {
                if (typeof loadAdminDashboardData === 'function') loadAdminDashboardData();
            }
        }
        
        // Always try to update weather pill on refresh
        if (typeof fetchAndDisplayWeather === 'function') fetchAndDisplayWeather();
    } catch (err) {
        console.error("Refresh failed:", err);
    }
}

// ============================================================
// 📊 LIVE DASHBOARD WIDGETS — Ongoing Containment + Alerts
// ============================================================
function renderDashboardWidgets() {
    const containmentList  = document.getElementById('containment-list');
    const criticalList     = document.getElementById('critical-alerts-list');
    const containmentBadge = document.getElementById('containment-count-badge');
    const criticalBadge    = document.getElementById('critical-count-badge');

    if (!containmentList && !criticalList) return; // Not on admin dashboard

    const alerts = state.alerts || [];

    // ── Containment %: based on severity + status ──
    const containmentPct = (alert) => {
        const st  = (alert.status   || 'open').toLowerCase();
        const sev = (alert.severity || 'medium').toLowerCase();
        if (st === 'extinguished' || st === 'resolved') return 100;
        if (st === 'contained')   return 80;
        // open / active — higher severity = lower containment
        const map = { critical: 12, high: 28, medium: 48, low: 65 };
        return map[sev] ?? 35;
    };

    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };

    // ── Ongoing Containment: active / open incidents ──
    if (containmentList) {
        const active = alerts
            .filter(a => ['open','active','new','contained'].includes((a.status||'').toLowerCase()))
            .sort((a, b) => (severityOrder[(b.severity||'medium').toLowerCase()]||2) - (severityOrder[(a.severity||'medium').toLowerCase()]||2))
            .slice(0, 5);

        if (containmentBadge) containmentBadge.textContent = active.length + ' Active';

        if (active.length === 0) {
            containmentList.innerHTML = `<div style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center;padding:20px 0;">✅ No active incidents</div>`;
        } else {
            containmentList.innerHTML = active.map(a => {
                const pct   = containmentPct(a);
                const label = a.title || `Incident #${a.id}`;
                const zone  = a.zone_name || a.area_type || '';
                // Color gradient based on pct
                const grad = pct >= 70 ? 'linear-gradient(90deg,#16a34a,#22c55e)'
                           : pct >= 40 ? 'linear-gradient(90deg,#ea580c,#f97316)'
                           :             'linear-gradient(90deg,#dc2626,#ef4444)';
                const clr  = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f97316' : '#ef4444';
                return `
                <div>
                    <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:6px;">
                        <span style="color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;" title="${label}${zone?' — '+zone:''}">🔥 ${label}${zone?' — '+zone:''}</span>
                        <span style="color:${clr};font-weight:bold;flex-shrink:0;">${pct}%</span>
                    </div>
                    <div style="width:100%;background:rgba(255,255,255,0.05);border-radius:8px;height:7px;overflow:hidden;">
                        <div style="width:${pct}%;background:${grad};height:100%;border-radius:8px;transition:width 0.6s ease;"></div>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // ── Critical Alerts: open alerts sorted by severity ──
    if (criticalList) {
        const critical = alerts
            .filter(a => ['open','active','new'].includes((a.status||'').toLowerCase()))
            .sort((a, b) => (severityOrder[(b.severity||'medium').toLowerCase()]||2) - (severityOrder[(a.severity||'medium').toLowerCase()]||2))
            .slice(0, 5);

        if (criticalBadge) criticalBadge.textContent = critical.length;

        if (critical.length === 0) {
            criticalList.innerHTML = `<div style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center;padding:20px 0;">✅ No active alerts</div>`;
        } else {
            const sevMeta = {
                critical: { icon:'🔴', bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.25)',  clr:'#ef4444' },
                high:     { icon:'🟠', bg:'rgba(249,115,22,0.08)', border:'rgba(249,115,22,0.25)', clr:'#f97316' },
                medium:   { icon:'🟡', bg:'rgba(234,179,8,0.08)',  border:'rgba(234,179,8,0.25)',  clr:'#eab308' },
                low:      { icon:'🟢', bg:'rgba(34,197,94,0.08)',  border:'rgba(34,197,94,0.25)',  clr:'#22c55e' },
            };
            criticalList.innerHTML = critical.map(a => {
                const sev  = (a.severity||'medium').toLowerCase();
                const m    = sevMeta[sev] || sevMeta.medium;
                const name = a.title || `Incident #${a.id}`;
                const sub  = a.zone_name || a.area_type || `ID #${a.id}`;
                return `
                <div style="padding:8px;background:${m.bg};border:1px solid ${m.border};border-radius:10px;
                    display:flex;gap:8px;align-items:center;cursor:pointer;height:42px;box-sizing:border-box;
                    transition:background 0.25s;" onclick="setMode('reports')"
                    onmouseover="this.style.background='${m.bg.replace('0.08','0.18')}'"
                    onmouseout="this.style.background='${m.bg}'">
                    <div style="flex-shrink:0;font-size:1rem;">${m.icon}</div>
                    <div style="display:flex;flex-direction:column;overflow:hidden;">
                        <span style="font-size:0.75rem;color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</span>
                        <span style="font-size:0.6rem;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sub} · ${sev.toUpperCase()}</span>
                    </div>
                </div>`;
            }).join('');
        }
    }
}
window.renderDashboardWidgets = renderDashboardWidgets;


async function loadZoneBoundaries() {
    try {
        const response = await fetch("/static/data/chlef_zones.geojson");
        if (!response.ok) return;
        const geo = await response.json();
        zoneLayer.clearLayers();
        zoneLayer.addData(geo);
    } catch (_error) {
    }
}

function playTacticalAlert() {
    // Sound muted upon user request
}

function renderTacticalMissions() {
    const container = document.getElementById("active-mission-container");
    const controls = document.getElementById("agent-controls");
    if (!container) return;

    const activeAlerts = state.alerts.filter(a => (a.status || "").toLowerCase() === "open" || (a.status || "").toLowerCase() === "active");
    
    if (activeAlerts.length === 0) {
        if (typeof routeLayer !== 'undefined') routeLayer.clearLayers();
        container.innerHTML = `<div class="empty-state" style="padding:40px; text-align:center; color:rgba(255,255,255,0.2);">
            <div style="font-size:3rem; margin-bottom:15px;">\uD83D\uDCE1</div>
            Scanning for emergency dispatches...
        </div>`;
        if (controls) controls.classList.add("hidden");
        return;
    }

    const latest = activeAlerts[0]; // Most recent alert

    // Viz the current mission on the map
    if (typeof map !== 'undefined' && map && latest && typeof routeLayer !== 'undefined') {
        routeLayer.clearLayers();
        const dispatch = (state.dispatches || []).find(d => d.alert_id == latest.id);
        if (dispatch) {
            const unit = state.units.find(u => u.id == dispatch.unit_id || u.name == dispatch.unit_name);
            if (unit) {
                L.polyline([[unit.lat, unit.lng], [latest.lat, latest.lng]], {
                    color: severityColor(latest.severity),
                    weight: 4,
                    opacity: 0.7,
                    dashArray: '8, 12'
                }).addTo(routeLayer).addTo(map);
            }
        }
    }

    const severity = (latest.severity || "medium").toUpperCase();
    const time = latest.created_at ? new Date(latest.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "NOW";

    container.innerHTML = `
        <div class="mission-card pulsing-alert" style="border-left: 5px solid ${severityColor(latest.severity)};">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:15px;">
                <div>
                    <span style="background:rgba(255,255,255,0.1); padding:4px 8px; border-radius:4px; font-size:0.7rem; font-weight:800; letter-spacing:1px; color:#aaa;">MISSION #${latest.id}</span>
                    <h2 style="margin:8px 0 0 0; font-size:1.4rem; color:#fff;">\uD83D\uDD25 INCIDENT DETECTED</h2>
                </div>
                <span style="color:${severityColor(latest.severity)}; font-weight:900; font-size:0.8rem;">${severity}</span>
            </div>
            
            <div style="background:rgba(0,0,0,0.2); padding:15px; border-radius:10px; margin-bottom:15px; border:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:0.8rem; color:#888; margin-bottom:5px;">LOCATION COORDINATES</div>
                <div style="font-family:'JetBrains Mono', monospace; font-size:1.1rem; color:var(--electric-blue);">${latest.lat.toFixed(4)}, ${latest.lng.toFixed(4)}</div>
            </div>

            <div class="mission-status-grid">
                <div class="mission-stat">
                    <h4>Reported</h4>
                    <div class="val">${time}</div>
                </div>
                <div class="mission-stat">
                    <h4>Distance</h4>
                    <div class="val">-- km</div>
                </div>
            </div>
            
            <div style="font-size:0.85rem; color:rgba(255,255,255,0.6); line-height:1.4; background:rgba(255,255,255,0.03); padding:10px; border-radius:8px;">
                <i class="fa-solid fa-info-circle" style="color:var(--primary); margin-right:8px;"></i>
                ${latest.description || "Active tactical response required."}
            </div>
        </div>
    `;

    if (controls) {
        controls.classList.remove("hidden");
        const arrivedBtn = controls.querySelector(".btn-arrived");
        const completeBtn = controls.querySelector(".btn-complete");
        if (arrivedBtn) arrivedBtn.setAttribute("onclick", `updateMissionStatus(${latest.id}, 'arrived')`);
        if (completeBtn) completeBtn.setAttribute("onclick", `updateMissionStatus(${latest.id}, 'resolved')`);
    }
}

async function updateMissionStatus(id, newStatus) {
    if (!id) return;
    
    showToast("Updating Mission", `Status: ${newStatus.toUpperCase()}`, "info");
    
    try {
        const res = await fetchJSON(`/api/alerts/${id}/status`, {
            method: "POST",
            body: JSON.stringify({ status: newStatus })
        });
        
        if (res.success) {
            showToast("Mission Updated", `Alert #${id} marked as ${newStatus}`, "success");
            await refreshData();
        } else {
            showToast("Update Failed", res.error || "Unknown error", "error");
        }
    } catch (err) {
        showToast("Error", err.message, "error");
    }
}
window.updateMissionStatus = updateMissionStatus;

async function submitDutyReport() {
    const pStatus = document.getElementById('duty-personnel-status')?.value;
    const vStatus = document.getElementById('duty-vehicle-status')?.value;
    
    if (!pStatus || !vStatus) return;
    
    showToast("Transmitting", "Sending duty report to headquarters...", "info");
    
    try {
        const response = await fetch('/api/fireman/status-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                personnel_status: pStatus,
                vehicle_status: vStatus
            })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast("Report Sent", "Admin has been notified of your status.", "success");
            setMode('dashboard'); // Return to mission center
        } else {
            showToast("Report Failed", data.error || "Unknown error", "error");
        }
    } catch (err) {
        showToast("Network Error", "Check your connection and try again.", "error");
    }
}
window.submitDutyReport = submitDutyReport;

async function submitAdminDutyUpdate() {
    const email = document.getElementById('admin-duty-user-select')?.value;
    const pStatus = document.getElementById('admin-duty-personnel-status')?.value;
    const vStatus = document.getElementById('admin-duty-vehicle-status')?.value;
    
    if (!email) {
        showToast("Agent Required", "Please select a fireman to update.", "warning");
        return;
    }
    
    console.log("Attempting tactical update for:", email, pStatus, vStatus);
    showToast("Transmitting", "Broadcasting tactical update...", "info");
    
    try {
        const response = await fetch('/api/admin/update-fireman-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                personnel_status: pStatus,
                vehicle_status: vStatus
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server Error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        if (data.success) {
            showToast("Update Transmitted", `Status for ${email} updated.`, "success");
            if (state.currentMode === 'maintenance') loadMaintenanceData();
            setMode('dashboard');
        } else {
            showToast("Update Failed", data.error || "Unknown server error", "error");
        }
    } catch (err) {
        console.error("Tactical update error:", err);
        showToast("Error", err.message || "Failed to connect to server", "error");
    }
}
window.submitAdminDutyUpdate = submitAdminDutyUpdate;

async function loadMaintenanceData() {
    const grid = document.getElementById('maintenance-grid');
    if (!grid) return;

    try {
        // Fetch Equipment
        const eqRes = await fetch('/api/equipment');
        const equipment = await eqRes.json();
        const brokenEq = equipment.filter(e => e.status === 'on_pan');

        // Fetch Units
        const unitRes = await fetch('/api/units');
        const units = await unitRes.json();
        const brokenUnits = units.filter(u => u.status === 'on_pan' || u.status === 'maintenance');

        const totalBroken = brokenEq.length + brokenUnits.length;
        const badge = document.getElementById('maintenance-badge');
        if (badge) {
            if (totalBroken > 0) {
                badge.innerText = totalBroken;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        if (totalBroken === 0) {
            grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1; padding: 60px; text-align: center; background: rgba(255,255,255,0.02); border-radius: 20px; border: 1px dashed rgba(255,255,255,0.1);">
                <div style="font-size: 4rem; margin-bottom: 20px; filter: drop-shadow(0 0 15px rgba(34, 197, 94, 0.4));">🛡️</div>
                <h3 style="color: #fff; margin-bottom: 10px;">TACTICAL READINESS: 100%</h3>
                <p style="color: rgba(255,255,255,0.4); max-width: 400px; margin: 0 auto;">No units or equipment currently reported as "En Panne". All Algerian fire defense systems are operational.</p>
            </div>`;
            return;
        }

        let html = '';
        
        // Render Equipment First (Higher Priority for the user)
        brokenEq.forEach(e => {
            html += `
            <div class="dash-card" style="border-left: 4px solid #ef4444; background: rgba(239, 68, 68, 0.05); animation: slideIn 0.3s ease-out;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div>
                        <div style="font-size: 0.7rem; color: #ef4444; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">🚒 RESOURCE FAILURE</div>
                        <h3 style="margin: 5px 0 0 0; color: #fff;">${e.type} (${e.code})</h3>
                    </div>
                    <span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700;">EN PANNE</span>
                </div>
                <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6); margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.1rem;">📍</span> Assigned to: <strong style="color: #fff;">${e.unit_name}</strong>
                </div>
                <button onclick="restoreEquipment('${e.id}')" class="map-btn blue" style="width: 100%; justify-content: center; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border: none; font-weight: 800; height: 42px; border-radius: 10px; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);">
                    🔧 RESTORE TO SERVICE
                </button>
            </div>`;
        });

        // Render Units (Only if major station failure)
        brokenUnits.forEach(u => {
            const agentList = u.assigned_firemen && u.assigned_firemen.length > 0 
                ? u.assigned_firemen.join(", ") 
                : "None Assigned";

            html += `
            <div class="dash-card" style="border-left: 4px solid #f97316; background: rgba(249, 115, 22, 0.05); animation: slideIn 0.3s ease-out;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div>
                        <div style="font-size: 0.7rem; color: #f97316; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">⚠️ TOTAL STATION DOWN</div>
                        <h3 style="margin: 5px 0 0 0; color: #fff;">${u.name}</h3>
                    </div>
                    <span style="background: rgba(249, 115, 22, 0.2); color: #f97316; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700;">MAINTENANCE</span>
                </div>
                <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6); margin-bottom: 5px;">
                    Coordinates: ${u.lat.toFixed(3)}, ${u.lng.toFixed(3)}
                </div>
                <div style="font-size: 0.85rem; color: #ff8c42; margin-bottom: 15px; font-weight: 600;">
                    👥 Agents Affected: <span style="color: #fff;">${agentList}</span>
                </div>
                <button onclick="toggleUnitStatus(${u.id}, 'on_pan')" class="map-btn blue" style="width: 100%; justify-content: center; background: #3b82f6; border: none; font-weight: 800; height: 42px; border-radius: 10px;">
                    🛠️ RE-OPEN STATION
                </button>
            </div>`;
        });

        grid.innerHTML = html;
    } catch (err) {
        console.error("Maintenance load error:", err);
    }
}
window.loadMaintenanceData = loadMaintenanceData;

async function restoreEquipment(eqId) {
    try {
        const res = await fetchJSON(`/api/equipment/${eqId}/status`, { 
            method: 'POST',
            body: JSON.stringify({ status: 'available' })
        });
        if (res.success) {
            showToast("Equipment Restored", "Unit is now back in tactical rotation", "success");
            loadMaintenanceData();
            loadAdminDashboardData();
        }
    } catch (err) {
        showToast("Error", err.message, "error");
    }
}
window.restoreEquipment = restoreEquipment;

async function loadFiremenForDuty() {
    const select = document.getElementById('admin-duty-user-select');
    if (!select) return;
    
    try {
        const response = await fetch('/api/users');
        const users = await response.json();
        const firemen = users.filter(u => u.role === 'fireman');
        
        let html = '<option value="">-- Select Fireman --</option>';
        firemen.forEach(f => {
            html += `<option value="${f.email}">${f.name || f.email.split('@')[0]} (${f.email})</option>`;
        });
        select.innerHTML = html;
    } catch (err) {
        console.error("Failed to load firemen for duty control", err);
    }
}
window.loadFiremenForDuty = loadFiremenForDuty;
    
function renderUserActivity() {
    const container = document.getElementById("user-activity-log");
    if (!container || !state.activity) return;

    if (state.activity.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:10px; color:rgba(255,255,255,0.2);">No recent activity recorded.</div>`;
        return;
    }

    container.innerHTML = state.activity.map(act => {
        const time = new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let color = "#ff9f43";
        if (act.action.includes("Login")) color = "#22c55e";
        if (act.action.includes("Created") || act.action.includes("Dispatch")) color = "#ef4444";

        return `
            <div style="display: flex; gap: 15px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <span style="color: ${color}; font-weight: 700; min-width: 55px;">[${time}]</span>
                <div style="flex: 1;">
                    <strong style="color: #fff;">${act.user_email.split('@')[0]}</strong> 
                    <span style="color: rgba(255,255,255,0.7);">${act.action}:</span> 
                    <span style="color: rgba(255,255,255,0.5); font-style: italic;">${act.details || ''}</span>
                </div>
            </div>
        `;
    }).join("");
}

function renderNotificationsDropdown() {
    const panel = document.getElementById("notif-panel");
    const badge = document.getElementById("notif-badge");
    const list = document.getElementById("notif-list");
    if (!panel || !badge || !list) return;

    const unreadCount = state.notifications.filter(n => n.unread).length;
    badge.textContent = unreadCount;
    
    if (unreadCount > 0) {
        badge.style.setProperty('display', 'block', 'important');
        badge.classList.remove('hidden');
    } else {
        badge.style.setProperty('display', 'none', 'important');
        badge.classList.add('hidden');
    }

    if (!state.notifications.length) {
        list.innerHTML = `<div class="notif-empty">No new alerts</div>`;
        return;
    }

    list.innerHTML = state.notifications.map(n => {
        const isUnread = n.unread;
        const icon = n.icon || '🔥';
        const severityColor = n.severity === 'critical' ? '#ef4444' : (n.severity === 'high' ? '#f97316' : '#3b82f6');

        return `
            <div class="notif-item ${isUnread ? 'unread' : ''}" data-id="${n.id}" data-alert-id="${n.alert_id || ''}" 
                 style="padding: 14px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: 0.3s; display: flex; gap: 12px; position: relative;">
                <div class="notif-icon" style="font-size: 1.3rem; min-width: 30px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.03); border-radius: 10px; height: 40px; width: 40px;">${icon}</div>
                <div class="notif-content" style="flex: 1;">
                    <div class="notif-title" style="font-weight: 800; color: #fff; font-size: 0.88rem; display: flex; justify-content: space-between;">
                        ${n.title}
                        <span style="font-size: 0.65rem; color: rgba(255,255,255,0.3); font-weight: 400;">${n.time || ''}</span>
                    </div>
                    <div class="notif-desc" style="font-size: 0.78rem; color: rgba(255,255,255,0.5); line-height: 1.4; margin-top: 4px;">${n.description || ''}</div>
                    <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="background: ${severityColor}22; color: ${severityColor}; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">${n.severity || 'Tactical'}</span>
                        ${n.alert_id ? `
                        <div style="display: flex; gap: 5px;">
                            <button class="notif-map-btn" data-lat="${n.lat || ''}" data-lng="${n.lng || ''}" 
                                    style="background: rgba(255,106,0,0.1); border: 1px solid rgba(255,106,0,0.2); color: #ff6a00; padding: 2px 6px; border-radius: 4px; font-size: 0.62rem; font-weight: 800; cursor: pointer; text-transform: uppercase;">
                                📍 MAP
                            </button>
                            <button class="notif-action-btn" data-id="${n.id}" data-alert-id="${n.alert_id || ''}" 
                                    style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 0.62rem; font-weight: 800; cursor: pointer; text-transform: uppercase;">
                                📋 REPORT
                            </button>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ${isUnread ? '<div style="position: absolute; right: 10px; top: 10px; width: 8px; height: 8px; background: #ef4444; border-radius: 50%; box-shadow: 0 0 10px #ef4444;"></div>' : ''}
            </div>
        `;
    }).join('');

    // Re-bind listeners
    list.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = Number(item.dataset.id);
            const alertId = item.dataset.alertId;
            markNotificationRead(id);
            renderNotificationsDropdown();
            
            if (alertId) {
                window.open(`/report/incident-pdf/${alertId}`, '_blank');
            }
        });
    });

    list.querySelectorAll('.notif-map-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const lat = Number(btn.dataset.lat);
            const lng = Number(btn.dataset.lng);
            if (lat && lng && typeof map !== 'undefined') {
                map.setView([lat, lng], 18);
                showToast("Tactical Focus", "Centering map on incident.", "info");
                document.getElementById('notif-panel')?.classList.remove('active');
            }
        });
    });

    list.querySelectorAll('.notif-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = Number(btn.dataset.id);
            const alertId = btn.dataset.alertId;
            markNotificationRead(id);
            renderNotificationsDropdown();
            
            if (alertId) {
                window.open(`/report/incident-pdf/${alertId}`, '_blank');
            }
        });
    });
}

function handleNotificationAction(action, id) {
    console.log("Tactical Action:", {action, id});
    // This is handled by inline clicks now for the report, 
    // but kept for compatibility with other parts of the system.
}


async function pollNotifications() {
    try {
        const notifications = await fetchJSON(`/api/notifications?since_id=${state.notificationCursor}`);
        if (!notifications || !notifications.length) {
            state.notificationInitialized = true;
            return;
        }

        // Newest notifications come first (DESC), so we take the first ID for next poll
        state.notificationCursor = notifications[0].id;

        // Process them so newest are unshifted into our array
        [...notifications].reverse().forEach((item) => {
            if (state.notifications.some(existing => existing.id === item.id)) return;

            const severity = item.type || "medium";
            const meta = getNotificationMeta(severity, item.status);
            
            state.notifications.unshift({
                id: item.id,
                alert_id: item.alert_id,
                title: item.title,
                description: item.message,
                time: new Date(item.created_at || Date.now()).toLocaleTimeString(),
                unread: !item.is_read,
                icon: meta.icon,
                lat: item.lat,
                lng: item.lng,
                severity: severity,
                status: item.status
            });
        });

        // Limit local cache
        state.notifications = state.notifications.slice(0, 30);
        renderNotificationsDropdown();
        
        if (state.notificationInitialized) {
            playTacticalAlert();
        }
        state.notificationInitialized = true;
        await refreshData();
    } catch (error) {
        console.error("Polling error:", error);
    }
}



function bindEvents() {
    const notifBtn = document.getElementById("btn-notifications");
    const notifPanel = document.getElementById("notif-panel");
    const themeBtn = document.getElementById("theme-toggle");
    const compareBtn = document.getElementById("btn-run-comparison");

    notifBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (notifPanel) {
            notifPanel.classList.toggle("active");
            if (notifPanel.classList.contains("active")) {
                renderNotificationsDropdown();
            }
        }
    });

    window.addEventListener("click", (event) => {
        if (!notifPanel || !notifBtn) return;
        if (!notifPanel.contains(event.target) && !notifBtn.contains(event.target)) {
            notifPanel.classList.remove("active");
        }
    });

    let isDark = true;
    themeBtn?.addEventListener("click", () => {
        isDark = !isDark;
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
        themeBtn.textContent = isDark ? "🌙" : "☀️";
        
        // Map stays white (OpenStreetMap) as requested by user
        if (map) {
            map.invalidateSize();
        }
    });

    compareBtn?.addEventListener("click", () => {
        runAlgorithmComparison();
    });

    const confirmBtn = document.getElementById("map-confirm-btn");
    confirmBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.currentMode === "report") submitIncident();
        if (state.currentMode === "unit") deployUnit();
        
        // Handle asset addition
        if (["addWater", "addStation", "addZone"].includes(state.currentMode)) {
            if (!state.lastClickedLocation) return;
            
            let formId = "";
            let modalId = "";
            let latName = "lat";
            let lngName = "lng";
            
            if (state.currentMode === "addWater") { formId = "addWaterForm"; modalId = "addWaterModal"; }
            if (state.currentMode === "addStation") { formId = "addStationForm"; modalId = "addStationModal"; }
            if (state.currentMode === "addZone") { formId = "addZoneForm"; modalId = "addZoneModal"; latName = "center_lat"; lngName = "center_lng"; }
            
            const form = document.getElementById(formId);
            if (form) {
                const latInput = form.querySelector(`input[name="${latName}"]`);
                const lngInput = form.querySelector(`input[name="${lngName}"]`);
                if (latInput) latInput.value = state.lastClickedLocation.lat.toFixed(6);
                if (lngInput) lngInput.value = state.lastClickedLocation.lng.toFixed(6);
            }
            
            document.getElementById(modalId).classList.remove("hidden");
            document.getElementById("map-overlay-container").classList.add("hidden");
            
            // Revert mode based on user role (view or admin dashboard)
            state.currentMode = "dashboard";
        }
    });

    const searchInput = document.getElementById("search-input");
    searchInput?.addEventListener("keypress", async (event) => {
        if (event.key !== "Enter") return;
        const query = searchInput.value.trim().toLowerCase();
        if (!query) return;

        showToast("Searching...", `Looking for: ${query}`, "info");

        // 1. Search for Units (wihda / markaz / station)
        const isUnitQuery = query.includes("") || query.includes("markaz") || query.includes("station") || query.includes("unit") || query.includes("wihda") || query.includes("");
        
        let cleanName = query.replace(/(|markaz|station|unit|wihda||manti9a|)/gi, "").trim();
        if (cleanName === "") cleanName = "chlef"; 

        let matchedUnit = null;
        if (isUnitQuery || cleanName) {
            matchedUnit = state.units.find((u) => u.name.toLowerCase().includes(cleanName) || cleanName.includes(u.name.toLowerCase()));
            if (!matchedUnit && isUnitQuery && cleanName === "chlef") {
                matchedUnit = state.units[0]; // fallback
            }
        }

        if (matchedUnit && isUnitQuery) {
            map.flyTo([matchedUnit.lat, matchedUnit.lng], 18, { animate: true, duration: 1.5 });
            showToast("Unit /  ", matchedUnit.name, "success");
            return;
        }

        // Exact match check for units without 'wihda' modifier
        if (matchedUnit && !query.includes("manti9a") && !query.includes("") && query.includes(matchedUnit.name.toLowerCase())) {
             map.flyTo([matchedUnit.lat, matchedUnit.lng], 18, { animate: true, duration: 1.5 });
             showToast("Unit Found", matchedUnit.name, "success");
             return;
        }

        // 2. Incident ID match (alert / incident)
        const idMatch = query.match(/\d+/);
        if (idMatch && (query.includes("alert") || query.includes("incident") || query.includes("id") || query.includes("hari9") || query.includes(""))) {
            const id = Number(idMatch[0]);
            const alert = state.alerts.find((x) => x.id === id);
            if (alert) {
                map.flyTo([alert.lat, alert.lng], 18, { animate: true, duration: 1.5 });
                showToast("Incident Found", `Alert #${alert.id} (${alert.type})`, "success");
                return;
            }
        }

        // 3. Geographic Search for Manti9a (Zone/Region)
        try {
            const mapQuery = (query.includes("chlef") || query.includes("")) ? cleanName : `${cleanName}, Chlef`;
            
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(mapQuery)}&countrycodes=dz`);
            const results = await response.json();
            
            if (!results.length) {
                // Optional Fallback: try raw query
                const fallbackResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanName)}&countrycodes=dz`);
                const fallbackRes = await fallbackResp.json();
                
                if(!fallbackRes.length) {
                    showToast("Not Found", "No Unit, Alert, or Region matched.", "warning");
                    return;
                }
                const res = fallbackRes[0];
                map.flyTo([Number(res.lat), Number(res.lon)], 13, {animate: true, duration: 1.5});
                showToast("Region Found", res.display_name.split(",")[0], "success");
                return;
            }

            const result = results[0];
            map.flyTo([Number(result.lat), Number(result.lon)], 13, {animate: true, duration: 1.5});
            showToast("Region Found", result.display_name.split(",")[0], "success");
        } catch (_error) {
            showToast("Error", "Search service unavailable", "error");
        }
    });

    map.on("click", (event) => {
        state.lastClickedLocation = event.latlng;

        // Handle instant pop-up for Add Asset modes
        if (["addWater", "addStation", "addZone", "addIndustrial"].includes(state.currentMode)) {
            let formId = "";
            let modalId = "";
            let latName = "lat";
            let lngName = "lng";
            
            if (state.currentMode === "addWater") { formId = "addWaterForm"; modalId = "addWaterModal"; }
            if (state.currentMode === "addStation") { formId = "addStationForm"; modalId = "addStationModal"; }
            if (state.currentMode === "addZone" || state.currentMode === "addIndustrial") { formId = "addZoneForm"; modalId = "addZoneModal"; latName = "center_lat"; lngName = "center_lng"; }
            
            const form = document.getElementById(formId);
            if (form) {
                const latInput = form.querySelector(`input[name="${latName}"]`);
                const lngInput = form.querySelector(`input[name="${lngName}"]`);
                if (latInput) latInput.value = state.lastClickedLocation.lat.toFixed(6);
                if (lngInput) lngInput.value = state.lastClickedLocation.lng.toFixed(6);
            }
            
            document.getElementById(modalId).classList.remove("hidden");
            document.getElementById("map-overlay-container").classList.add("hidden");
            
            // Revert mode based on user role
            state.currentMode = "dashboard";
            return; // Stop execution so weather is not fetched
        }

        if (state.currentMode === "report" || state.currentMode === "unit") {
            const latInput = document.getElementById("input-lat");
            const lngInput = document.getElementById("input-lng");
            if (latInput) latInput.value = event.latlng.lat.toFixed(6);
            if (lngInput) lngInput.value = event.latlng.lng.toFixed(6);

            const confirm = document.getElementById("map-confirm-btn");
            confirm?.classList.add("visible");
            const instruction = document.querySelector(".map-instruction");
            if (instruction) instruction.innerText = "Location set. Confirm to proceed.";

            if (pendingSelectionMarker) {
                map.removeLayer(pendingSelectionMarker);
            }

            const markerColor = state.currentMode === "report" ? "#ef4444" : "#38bdf8";
            pendingSelectionMarker = L.circleMarker([event.latlng.lat, event.latlng.lng], {
                radius: 8,
                color: "#ffffff",
                weight: 2,
                fillColor: markerColor,
                fillOpacity: 0.95
            });
        }

        // Always update weather on map click for tactical awareness
        if (typeof fetchAndDisplayWeather === "function") {
            fetchAndDisplayWeather(event.latlng.lat, event.latlng.lng);
            
            // Temporary marker to show weather probe location
            const probe = L.circleMarker(event.latlng, {
                radius: 12,
                color: '#a78bfa',
                weight: 2,
                fillColor: '#a78bfa',
                fillOpacity: 0.3,
                className: 'weather-probe-pulse'
            });
            setTimeout(() => map.removeLayer(probe), 2000);
        }

        if (state.currentMode === "analysis" || state.currentMode === "dashboard") {
            renderAnalysis();
        }
    });
}

async function init() {
    if (!map) {
        map = L.map("map", {
            maxBounds: algeriaBounds,
            maxBoundsViscosity: 1.0,
            minZoom: 5,
            maxZoom: 18
        }).setView([mapConfig.startLat, mapConfig.startLng], mapConfig.zoom);
        
        // Expose map globally so inline HTML scripts and other modules can access it
        window.map = map;
        
        tileLayer.addTo(map);
        
        unitLayer.addTo(map);
        alertLayer.addTo(map);
        actionLayer.addTo(map);
        zoneCircleLayer.addTo(map);
        zoneLayer.addTo(map);
    } else {
        // Always keep window.map in sync
        window.map = map;
    }
    
    setupAlgorithmButtons();
    bindEvents();
    setInterval(updateTime, 1000);
    updateTime();

    // Check for focus from URL params (from notifications page)
    const urlParams = new URLSearchParams(window.location.search);
    const focusId = urlParams.get('focus');
    const flat = urlParams.get('lat');
    const flng = urlParams.get('lng');
    if (focusId && flat && flng) {
        setTimeout(() => {
            focusIncident(focusId, parseFloat(flat), parseFloat(flng));
        }, 2000);
    }

    window.addEventListener("online", () => {
        showToast("Connection Restored", "Syncing offline alerts...", "info");
        flushOfflineQueue(true).catch(() => {});
    });

    try {
        // await loadZoneBoundaries();
        await refreshData();
        await flushOfflineQueue(false);
        renderNotificationsDropdown();
        initCharts();
        setMode("dashboard");
        // Initialize sidebar weather
        updateSidebarWeather('chlef');
        // Load admin dashboard if available
        setTimeout(() => {
            if (typeof loadAdminDashboardData === 'function') {
                loadAdminDashboardData().catch(e => console.log('Admin dashboard not needed:', e.message));
            }
        }, 1000);
        showToast("System", "Control Center connected to database", "success");
    } catch (error) {
        showToast("Backend Error", error.message, "error");
    }

    pollNotifications(); // run immediately on load
    setInterval(pollNotifications, 6000);
    setInterval(refreshData, 12000);
    setInterval(checkHybridResolutions, 5000); //  HYBRID RESOLVE CHECKER
    setInterval(() => {
        flushOfflineQueue(false).catch(() => {});
    }, 10000);
}

init();

// ==========================================
// \uD83D\uDD25 HYBRID RESOLUTION SYSTEM \uD83D\uDD25
// ==========================================
let scheduledPrompts = {};
let activePrompts = new Set();

function checkHybridResolutions() {
    if (!state.alerts) return;
    const now = new Date().getTime();

    state.alerts.forEach(alert => {
        if ((alert.status || "").toLowerCase() !== "open") {
            if (activePrompts.has(alert.id)) {
                const el = document.getElementById('hybrid-prompt-' + alert.id);
                if (el) el.remove();
                activePrompts.delete(alert.id);
            }
            return;
        }

        if (!scheduledPrompts[alert.id]) {
            const created = new Date(alert.created_at).getTime();
            scheduledPrompts[alert.id] = created + 30000; // Trigger 30s after creation
        }

        if (now >= scheduledPrompts[alert.id] && !activePrompts.has(alert.id)) {
            triggerSmartPrompt(alert);
        }
    });
}

function triggerSmartPrompt(alert) {
    activePrompts.add(alert.id);
    const container = document.getElementById("smart-prompts-container");
    if (!container) return;

    const div = document.createElement("div");
    div.id = 'hybrid-prompt-' + alert.id;
    div.style.background = "rgba(15, 23, 42, 0.95)";
    div.style.border = "1px solid var(--primary)";
    div.style.borderLeft = "4px solid var(--solar-yellow)";
    div.style.padding = "15px";
    div.style.borderRadius = "8px";
    div.style.width = "320px";
    div.style.boxShadow = "0 8px 30px rgba(0,0,0,0.6)";
    div.style.backdropFilter = "blur(10px)";
    div.style.pointerEvents = "auto";
    div.style.transform = "translateX(400px)";
    div.style.transition = "transform 0.4s ease-out";
    
    let countdown = 120; // Increased to 2 minutes for tactical analysis
    
    // Find unit name assigned to this incident if possible
    let assignedUnit = "Search & Rescue Unit";
    if (state.dispatches) {
        const d = state.dispatches.find(d => d.alert_id == alert.id);
        if (d) assignedUnit = d.unit_name || d.unit_id;
    }

    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
                <strong style="color: white; font-size: 1.1rem;">🔥 Incident #${alert.id}</strong>
                <div style="color: #cbd5e1; font-size: 0.85rem; margin-top: 4px; font-weight: 700;">
                    ⚓ UNIT: <span style="color: var(--solar-yellow);">${assignedUnit}</span>
                </div>
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 2px;">Scenario verification required.</div>
            </div>
            <span style="font-size: 1.5rem; filter: drop-shadow(0 0 5px var(--solar-yellow));">⌛</span>
        </div>
        
        <div style="background: rgba(255,140,66,0.1); border: 1px dashed rgba(255,140,66,0.3); border-radius: 6px; padding: 10px; margin-bottom: 15px;">
             <div style="font-weight: 700; color: #fff; font-size: 0.9rem; text-align: center;">
                Has the fire been extinguished?
             </div>
        </div>

        <div style="display: flex; gap: 10px;">
            <button id="resolve-btn-${alert.id}" style="flex: 1; padding: 10px; border: none; border-radius: 8px; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; cursor: pointer; font-weight: 900; font-family: 'Cairo', sans-serif; box-shadow: 0 4px 10px rgba(34, 197, 94, 0.3);">
                ✅ CONFIRM
            </button>
            <button id="extend-btn-${alert.id}" style="flex: 1; padding: 10px; border: none; border-radius: 8px; background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: white; cursor: pointer; font-weight: 900; font-family: 'Cairo', sans-serif; box-shadow: 0 4px 10px rgba(239, 68, 68, 0.3);">
                ❌ NOT YET
            </button>
        </div>
        
        <div style="margin-top: 12px; display: flex; align-items: center; justify-content: space-between;">
             <button onclick="map.flyTo([${alert.lat}, ${alert.lng}], 17); setMode('dashboard');" style="background: rgba(14, 165, 233, 0.15); border: 1px solid #0ea5e9; color: #0ea5e9; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; cursor: pointer;">
                🗺️ VIEW ON MAP
             </button>
             <div style="font-size: 0.75rem; color: #94a3b8;">
                Closing prompt in <span id="auto-timer-${alert.id}" style="color: var(--solar-yellow); font-weight: bold;">${countdown}</span>s
             </div>
        </div>
    `;

    container.appendChild(div);
    setTimeout(() => div.style.transform = "translateX(0)", 50);

    const autoTimerEl = div.querySelector('#auto-timer-' + alert.id);
    
    const timerInterval = setInterval(() => {
        countdown--;
        if (autoTimerEl) autoTimerEl.innerText = countdown;
        if (countdown <= 0) {
            clearInterval(timerInterval);
            // DO NOT AUTO-RESOLVE - Just hide for manual control
            activePrompts.delete(alert.id);
            div.style.transform = "translateX(400px)";
            setTimeout(() => div.remove(), 400);
            scheduledPrompts[alert.id] = new Date().getTime() + 300000; // Reminder in 5 mins
        }
    }, 1000);

    div.querySelector('#resolve-btn-' + alert.id).addEventListener("click", () => {
        clearInterval(timerInterval);
        executeResolve(alert.id, div);
    });

    div.querySelector('#extend-btn-' + alert.id).addEventListener("click", () => {
        // Stop the auto-close timer since the user interacted manually
        clearInterval(timerInterval);
        
        showToast("⚠️ REINFORCEMENTS REQUESTED", "Checking for nearest available backup units...", "warning");
        
        fetchJSON(`/api/alerts/${alert.id}/escalate`, { method: 'POST' })
            .then(res => {
                if(res.success) {
                    const newCount = res.new_dispatch_count || "Additional";
                    showToast("Reinforcements Dispatched", `Success: ${newCount} backup units are now moving to Incident #${alert.id}.`, "success");
                    
                    // Update map to show new units
                    if(typeof refreshData === 'function') {
                        refreshData().then(() => {
                            if(typeof renderMapData === 'function') renderMapData();
                        });
                    }

                    // CRITICAL: Instead of closing, we reset the message so the user can CONFIRM later
                    const timerText = div.querySelector('#auto-timer-' + alert.id);
                    if (timerText) timerText.parentElement.innerHTML = '<i>Reinforcements Arriving... Waiting for mission completion.</i>';
                    
                    // Change "NOT YET" appearance to show it's already escalated
                    const extendBtn = div.querySelector('#extend-btn-' + alert.id);
                    if (extendBtn) {
                        extendBtn.disabled = true;
                        extendBtn.style.background = "#475569"; // Gray out
                        extendBtn.innerText = "🚨 REINFORCED";
                    }
                } else {
                    showToast("No Local Backup", "Wilaya response limit reached.", "info");
                    // If no more backup, just keep the prompt as is
                }
            })
            .catch(err => {
                console.error("Escalation failed:", err);
            });

        // Extend their "reminder" time in case they do close it, but keep current div open
        scheduledPrompts[alert.id] = new Date().getTime() + 600000;
    });
}

async function executeResolve(alertId, modalDiv) {
    // Show a formal confirmation dialog before extinguishing
    const isConfirmed = confirm(`🚩 TACTICAL ALERT: Are you sure the fire (Incident #${alertId}) is fully extinguished? \n\nThis will release all dispatched units back to their base.`);
    
    if (!isConfirmed) return;

    try {
        const result = await fetchJSON('/api/alerts/' + alertId + '/resolve', { method: "POST" });
        if (result.error) {
            showToast("Error", "Could not resolve alert.", "error");
            return;
        }
        
        modalDiv.style.transform = "translateX(400px)";
        setTimeout(() => modalDiv.remove(), 400);
        
        showToast("Extinguished", "SUCCESS: Fire extinguished. Mission pulse updated.", "success");
        await refreshData();
        
        // Final map cleanup
        if (typeof renderMapData === 'function') renderMapData();
        if (typeof renderDashboardWidgets === 'function') renderDashboardWidgets();
        
    } catch (err) {
        console.error(err);
        showToast("System Error", "Database sync failed during resolution.", "error");
    }
}


// ALGORITHM STUBS
window.runIPAlgorithm = async function() {
    const outField = document.getElementById('ip-output');
    outField.value = 'Connecting to backend to run IP Optimizer...\nPlease wait...';
    
    try {
        const lat = state.lastClickedLocation?.lat || 36.1653;
        const lng = state.lastClickedLocation?.lng || 1.3345;
        const severity = document.getElementById('input-severity')?.value || 'medium';
        const areaType = document.getElementById('input-area')?.value || 'Urban';
        const wind = parseFloat(document.getElementById('report-wind-val')?.value || "0") || 0;
        const temp = parseFloat(document.getElementById('report-temp-val')?.value || "20") || 20;
        const rain = parseFloat(document.getElementById('report-rain-val')?.value || "0") || 0;

        const payload = {
            lat,
            lng,
            severity,
            area_type: areaType,
            wind,
            temp,
            rain,
            budget: parseFloat(document.getElementById('ip-budget').value) || 10000,
            horizon: parseFloat(document.getElementById('ip-horizon').value) || 300,
            dominoTime: parseFloat(document.getElementById('ip-domino-time').value) || 30,
            scenario: parseInt(document.getElementById('ip-scenario').value) || 1,
            costTruck: parseFloat(document.getElementById('ip-cost-truck').value) || 300,
            costHeli: parseFloat(document.getElementById('ip-cost-heli').value) || 800,
            costDrone: parseFloat(document.getElementById('ip-cost-drone').value) || 100
        };

        const response = await fetch('/api/optimize/ip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Network error');
        
        const data = await response.json();
        // Simulate thinking time for effect
        setTimeout(() => {
            outField.value = data.output || data.log || 'IP completed.';
        }, 800);
        
    } catch (err) {
        console.error(err);
        outField.value = 'Error: Failed to connect to IP Optimizer Engine.\nEnsure backend is running.';
    }
};

window.runGPAlgorithm = async function() {
    const outField = document.getElementById('gp-output');
    outField.value = 'Connecting to backend to run Goal Programming Optimizer... \nPlease wait...'; 
    try {
        const lat = state.lastClickedLocation?.lat || 36.1653;
        const lng = state.lastClickedLocation?.lng || 1.3345;
        const severity = document.getElementById('input-severity')?.value || 'medium';
        const areaType = document.getElementById('input-area')?.value || 'Urban';
        const wind = parseFloat(document.getElementById('report-wind-val')?.value || "0") || 0;
        const temp = parseFloat(document.getElementById('report-temp-val')?.value || "20") || 20;
        const rain = parseFloat(document.getElementById('report-rain-val')?.value || "0") || 0;

        const bodyData = {
            lat,
            lng,
            severity,
            area_type: areaType,
            wind,
            temp,
            rain,
            targetDamage: parseFloat(document.getElementById('gp-target-damage').value) || 400,
            targetCost: parseFloat(document.getElementById('gp-target-cost').value) || 4000,
            w1: parseFloat(document.getElementById('gp-w1').value) || 0.5,
            w2: parseFloat(document.getElementById('gp-w2').value) || 0.5,
            budget: parseFloat(document.getElementById('gp-budget').value) || 10000,
            horizon: parseFloat(document.getElementById('gp-horizon').value) || 300
        };

        const response = await fetch('/api/optimize/gp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();
        outField.value = data.output || data.log || 'GP completed.';
        
    } catch (err) {
        console.error(err);
        outField.value = 'Error: Failed to connect to GP Optimizer Engine.\nEnsure backend is running.';
    }
};

function toggleMapView() {
    const wrapper = document.getElementById('map-card-wrapper');
    const viewBtn = document.getElementById('view-toggle');

    if (!wrapper) return;

    // Cycle: Standard (270px) → Collapsed (120px) → Expanded (75vh) → Standard
    if (!wrapper.classList.contains('collapsed') && !wrapper.classList.contains('expanded')) {
        // Go to collapsed
        wrapper.classList.add('collapsed');
        if (viewBtn) viewBtn.title = 'Expand Map';
        showToast("View Mode", "Data Focus: Panels Maximized", "info");
    } else if (wrapper.classList.contains('collapsed')) {
        // Go to expanded
        wrapper.classList.remove('collapsed');
        wrapper.classList.add('expanded');
        if (viewBtn) viewBtn.title = 'Restore Standard View';
        showToast("View Mode", "Tactical Focus: Map Maximized", "info");
    } else {
        // Go back to standard
        wrapper.classList.remove('expanded');
        if (viewBtn) viewBtn.title = 'Collapse Map';
        showToast("View Mode", "Standard View Restored", "info");
    }

    // Let Leaflet recalculate map size after CSS transition finishes
    setTimeout(() => {
        if (typeof map !== 'undefined') map.invalidateSize();
    }, 400);
}

// ==========================================
// 🚀 OPTIMIZATION HUB ENGINE
// ==========================================
convergenceChart = null;
resourcePieChart = null;

async function runOptimizationEngine(algoType) {
    // Map algo type to backend algorithm name
    const algoMap = {
        'ip':     { label: 'Integer Programming (ILP)',    endpoint: '/api/optimize/ip',  method: 'ip' },
        'gp':     { label: 'Goal Programming',             endpoint: '/api/optimize/gp',  method: 'gp' },
        'nsga':   { label: 'NSGA-II / Genetic Algorithm',  endpoint: '/api/optimize',     method: 'nsga' },
        'hybrid': { label: 'Hybrid PSO-GWO Swarm',         endpoint: '/api/optimize',     method: 'hybrid' }
    };

    const algo = algoMap[algoType];
    if (!algo) return;

    // Highlight selected card
    document.querySelectorAll('.algo-card').forEach(c => c.classList.remove('active'));
    const clickedCard = document.querySelector(`.algo-card[onclick*="${algoType}"]`);
    if (clickedCard) clickedCard.classList.add('active');

    // Show results section
    const resultsDiv = document.getElementById('optimization-results-dashboard');
    const planDiv   = document.getElementById('algo-plan-details');
    const runTag    = document.getElementById('algo-running-tag');

    if (resultsDiv) resultsDiv.classList.remove('hidden');
    if (planDiv) planDiv.innerText = ` Running ${algo.label}...\nPlease wait...`;
    if (runTag) { runTag.innerText = 'PROCESSING...'; runTag.style.color = '#fbbf24'; }
    const areaType = document.getElementById('input-area')?.value || 'Urban';

    showToast("Optimization Hub", `Launching ${algo.label}...`, "info");

    // Build payload
    const lat = state.lastClickedLocation?.lat || 36.1653;
    const lng = state.lastClickedLocation?.lng || 1.3345;
    const severity = document.getElementById('input-severity')?.value || 'medium';
    const wind = parseFloat(document.getElementById('report-wind-val')?.value || "0") || 0;
    const temp = parseFloat(document.getElementById('report-temp-val')?.value || "20") || 20;
    const rain = parseFloat(document.getElementById('report-rain-val')?.value || "0") || 0;

    let payload = {};
    if (algoType === 'ip') {
        payload = { lat, lng, severity, wind, temp, rain, budget: 10000, horizon: 300, dominoTime: 30, scenario: 1, costTruck: 300, costHeli: 800, costDrone: 100, area_type: areaType };
    } else if (algoType === 'gp') {
        payload = { lat, lng, severity, wind, temp, rain, targetDamage: 400, targetCost: 4000, w1: 0.5, w2: 0.5, budget: 10000, horizon: 300, area_type: areaType };
    } else {
        payload = { lat, lng, severity, algorithm: algo.method, area_type: areaType };
    }

    try {
        const response = await fetch(algo.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        // Update plan details - Transformation to Table
        const planDiv = document.getElementById('algo-plan-details');
        if (planDiv) {
            if (data.plan_data) {
                let tableHtml = `<table style="width:100%; border-collapse:collapse; margin-top:10px; color:#fff;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--primary); text-align:left;">
                            <th style="padding:10px;">Operational Zone</th>
                            <th style="padding:10px;">Severity</th>
                            <th style="padding:10px;">Allocation</th>
                        </tr>
                    </thead>
                    <tbody>`;
                data.plan_data.forEach(p => {
                    const allocation = p.trucks ? `${p.trucks} Trucks, ${p.helis} Helis, ${p.drones} Drones` : `${p.cost} (Exp. Damage: ${p.damage})`;
                    tableHtml += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding:10px; font-weight:700; color:var(--primary);">${p.zone}</td>
                        <td style="padding:10px;"><span style="background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:4px; font-size:0.75rem;">${p.severity}</span></td>
                        <td style="padding:10px; font-family:'Courier New', monospace; color:#00ff88;">${allocation}</td>
                    </tr>`;
                });
                tableHtml += `</tbody></table>`;
                planDiv.style.whiteSpace = 'normal';
                planDiv.style.fontFamily = 'inherit';
                planDiv.innerHTML = tableHtml;
            } else if (data.candidates) {
                // For GA/Hybrid which returns candidates
                let tableHtml = `<table style="width:100%; border-collapse:collapse; margin-top:10px; color:#fff;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--primary); text-align:left;">
                            <th style="padding:10px;">Unit</th>
                            <th style="padding:10px;">Type</th>
                            <th style="padding:10px;">ETA / Distance</th>
                        </tr>
                    </thead>
                    <tbody>`;
                data.candidates.forEach(c => {
                    let statusTag = '';
                    if (c.is_busy) {
                        statusTag = `<span style="color:#ef4444; background:rgba(239, 68, 68, 0.1); font-size:0.65rem; font-weight:800; border:1px solid #ef4444; padding:1px 4px; border-radius:3px; margin-left:6px; vertical-align: middle;">BUSY</span>`;
                    } else if (c.is_broken) {
                        statusTag = `<span style="color:#f59e0b; background:rgba(245, 158, 11, 0.1); font-size:0.65rem; font-weight:800; border:1px solid #f59e0b; padding:1px 4px; border-radius:3px; margin-left:6px; vertical-align: middle;">ON PAN</span>`;
                    }
                    
                    const isUnavailable = c.is_busy || c.is_broken;
                    
                    tableHtml += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05); ${isUnavailable ? 'opacity:0.6; cursor:not-allowed;' : ''}">
                        <td style="padding:10px; font-weight:700; color:var(--primary); line-height:1.2;">
                            <div style="display:flex; flex-direction:column;">
                                <span>${c.unit_name || c.unit_id}</span>
                                ${statusTag ? `<div>${statusTag}</div>` : ''}
                            </div>
                        </td>
                        <td style="padding:10px;"><span style="background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:4px; font-size:0.75rem;">${c.type}</span></td>
                        <td style="padding:10px; font-family:'Courier New', monospace; color:#00ff88;">
                            ${isUnavailable ? '--' : Math.round(c.eta_minutes) + 'm'} (${c.distance_km.toFixed(1)}km)
                        </td>
                    </tr>`;
                });
                tableHtml += `</tbody></table>`;
                planDiv.style.whiteSpace = 'normal';
                planDiv.style.fontFamily = 'inherit';
                planDiv.innerHTML = tableHtml;
            } else {
                planDiv.style.whiteSpace = 'pre-wrap';
                planDiv.style.fontFamily = "'Courier New', monospace";
                planDiv.innerText = data.log || 'Optimization complete.';
            }
        }

        if (runTag) { runTag.innerText = '✅ COMPLETE'; runTag.style.color = '#00ff88'; }

        // Render charts
        if (data.chart_data) {
            renderOptimizationCharts(data.chart_data, algo.label);
        }

        // --- NEW: Update Tactical Metrics in Optimization Panel ---
        if (data.candidates && data.candidates.length > 0) {
            let totalDist = 0;
            let totalCost = 0;
            let maxEta = 0;
            
            // Re-using the same logic as backend/benchmark for consistency
            const costMap = { 'F.P.T': 45000, 'C.C': 55000, 'Heli': 180000, 'Ambu': 15000, 'Drone': 8000, 'Foam': 65000 };
            const coverageMap = { 'F.P.T': 0.5, 'C.C': 0.5, 'Heli': 1.5, 'Ambu': 0.1, 'Foam': 0.8, 'Drone': 0.2 };
            let totalCov = 0;
            const dominoThreshold = 30; // Default
            const areaHa = 45.0; // Default

            data.candidates.forEach(c => {
                totalDist += c.distance_km || 0;
                maxEta = Math.max(maxEta, c.eta_minutes || 0);
                
                // Estimate cost
                let cost = 30000;
                for (const [key, val] of Object.entries(costMap)) {
                    if (c.type.includes(key)) { cost = val; break; }
                }
                totalCost += cost;

                // Estimate coverage/losses
                let alpha = 0.3;
                for (const [key, val] of Object.entries(coverageMap)) {
                    if (c.type.includes(key)) { alpha = val; break; }
                }
                const workingTime = Math.max(0, dominoThreshold - (c.eta_minutes || 0));
                totalCov += (alpha * workingTime);
            });

            const avgDist = (totalDist / data.candidates.length).toFixed(1);
            const lossPct = Math.min(100, Math.max(0, (areaHa - totalCov) / areaHa * 100)).toFixed(1);

            const mDist = document.getElementById('opt-metric-distance');
            const mTime = document.getElementById('opt-metric-time');
            const mCost = document.getElementById('opt-metric-cost');
            const mLoss = document.getElementById('opt-metric-losses');

            if (mDist) mDist.innerText = `${avgDist} km`;
            if (mTime) mTime.innerText = `${Math.round(maxEta)}m`;
            if (mCost) mCost.innerText = `${(totalCost/1000).toFixed(1)}k`;
            if (mLoss) mLoss.innerText = `${lossPct}%`;
        }

        showToast("Optimization Complete", `${algo.label}  results ready`, "success");

        // --- NEW: Auto-scroll to results for better visibility ---
        if (resultsDiv) {
            setTimeout(() => {
                resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
        }

    } catch (err) {
        if (planDiv) planDiv.innerText = `Error: Could not connect to optimization engine.\n${err.message}`;
        if (runTag) { runTag.innerText = ' ERROR'; runTag.style.color = '#ef4444'; }
        showToast("Engine Error", err.message, "error");
    }
}
window.runOptimizationEngine = runOptimizationEngine;

function renderOptimizationCharts(chartData, algoLabel) {
    // Convergence Line Chart
    const ctx1 = document.getElementById('convergenceChart');
    if (ctx1) {
        if (convergenceChart) convergenceChart.destroy();
        convergenceChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: chartData.convergence.map((_, i) => `Gen ${i + 1}`),
                datasets: [{
                    label: 'Objective Value',
                    data: chartData.convergence,
                    borderColor: '#a78bfa',
                    backgroundColor: 'rgba(167, 139, 250, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#a78bfa'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                    x: { grid: { display: false }, ticks: { color: '#888' } }
                }
            }
        });
    }

    // Performance Bar Chart (T-D-C)
    const ctx2 = document.getElementById('resourcePieChart');
    if (ctx2) {
        if (resourcePieChart) resourcePieChart.destroy();
        resourcePieChart = new Chart(ctx2, {
            type: 'radar',
            data: {
                labels: ['Time ⏳', 'Cost 💰', 'Reliability ✅', 'Coverage 🎯', 'Safety 🛡️'],
                datasets: [{
                    label: algoLabel,
                    data: chartData.performance,
                    backgroundColor: 'rgba(167, 139, 250, 0.2)',
                    borderColor: '#a78bfa',
                    borderWidth: 2,
                    pointBackgroundColor: '#a78bfa'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true, max: 100,
                        grid: { color: 'rgba(255,255,255,0.08)', circular: true },
                        ticks: { color: '#888', backdropColor: 'transparent', stepSize: 25, display: false },
                        angleLines: { color: 'rgba(255,255,255,0.05)' },
                        pointLabels: { color: '#aaa', font: { size: 11 } }
                    }
                },
                plugins: { legend: { labels: { color: '#aaa' } } }
            }
        });
    }
}

// ==========================================
//  USER MANAGEMENT PANEL
// ==========================================

// State variable for showing archived users
let showArchivedUsers = false;

window.toggleArchiveView = function() {
    showArchivedUsers = !showArchivedUsers;
    const btn = document.getElementById("btn-toggle-archive");
    if (btn) {
        btn.innerHTML = showArchivedUsers ? '👁️ Hide Blocked/Deleted Users' : '👁️ Show Blocked/Deleted Users';
        btn.style.color = showArchivedUsers ? '#ef4444' : '#aaa';
    }
    loadUsers();
};

async function loadUsers() {
    const grid = document.getElementById('users-grid');
    if (!grid) return;

    grid.innerHTML = `<div style="padding:30px; text-align:center; color:rgba(255,255,255,0.3);">
        <p> Loading security directory...</p></div>`;
    showToast("Security Directory", "Syncing user data...", "info");

    try {
        let users = await fetchJSON('/api/users?t=' + Date.now());
        if (!users) users = [];

        // Filter users based on archive toggle state
        // If false, show only active non-blocked users
        // If true, show only blocked users OR deleted users
        if (showArchivedUsers) {
            users = users.filter(u => u.is_blocked || u.is_deleted);
        } else {
            users = users.filter(u => !u.is_blocked && !u.is_deleted);
        }

        if (users.length === 0) {
            grid.innerHTML = `<div style="padding:30px; text-align:center; color:rgba(255,255,255,0.2);">No personnel found.</div>`;
            return;
        }

        const roleColors = { admin: '#f97316', fireman: '#ef4444', citizen: '#22c55e' };
        const roleIcons  = { admin: '🚒', fireman: '🛡️', citizen: '' };

        grid.innerHTML = users.map(u => {
            const role = String(u.role || 'citizen').toLowerCase();
            const roleColor = roleColors[role] || '#a78bfa';
            const roleIcon  = roleIcons[role]  || '';
            const lastLogin = u.last_login ? new Date(u.last_login).toLocaleString() : 'Never';
            const initials  = (u.name || u.email || '?').slice(0, 2).toUpperCase();

            /* COMPACT UPDATE VERIFIED */
            return `
            <div class="user-card-premium" style="
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 8px;
                padding: 6px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
            " onmouseover="this.style.borderColor='${roleColor}44'; this.style.background='rgba(255,255,255,0.08)'"
               onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'; this.style.background='rgba(255,255,255,0.05)'">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="
                        width: 32px; height: 32px; border-radius: 8px;
                        background: linear-gradient(135deg, ${roleColor}33, ${roleColor}55);
                        border: 1px solid ${roleColor};
                        display: flex; align-items: center; justify-content: center;
                        font-weight: 800; font-size: 0.8rem; color: ${roleColor};
                        box-shadow: 0 2px 8px ${roleColor}22;
                    ">${u.picture ? `<img src="${u.picture}" style="width:100%;height:100%;border-radius:6px;object-fit:cover;" onerror="this.outerHTML='${initials}'">` : initials}</div>
                    
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <div style="
                            display: inline-flex; align-items: center; gap: 4px;
                            background: ${roleColor}22; border: 1px solid ${roleColor}44;
                            color: ${roleColor}; padding: 2px 6px; border-radius: 4px;
                            font-size: 0.6rem; font-weight: 800;
                        ">${roleIcon} ${role.toUpperCase()}</div>
                        ${role === 'citizen' ? `<button onclick="deleteUser('${u.email}')" style="background:none; border:none; color:#ef4444; opacity:0.5; cursor:pointer; font-size: 0.85rem;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'">🗑️</button>` : ''}
                    </div>
                </div>

                <div style="flex: 1; min-width:0;">
                    <div style="font-weight: 700; font-size: 0.82rem; color: #fff; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${u.name || 'Unknown'}
                    </div>
                    <div style="font-size: 0.68rem; color: rgba(255,255,255,0.4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 1px;">
                        ✉️ ${u.email}
                    </div>
                    <div style="font-size: 0.6rem; color: rgba(255,255,255,0.2);">
                        🕒 ${lastLogin}
                    </div>
                </div>

                <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">
                    ${role === 'citizen' ? `
                    <button onclick="toggleUserBlock('${u.email}', ${!u.is_blocked})" style="
                        width: 100%; background: ${u.is_blocked ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.05)'}; 
                        border: 1px solid ${u.is_blocked ? '#22c55e' : 'rgba(239,68,68,0.2)'}; 
                        color: ${u.is_blocked ? '#22c55e' : '#ef4444'};
                        padding: 3px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; cursor: pointer; height: 22px;
                    ">
                        ${u.is_blocked ? '✅ Unblock / Restore' : '🚫 Block User'}
                    </button>` : ''}

                    <div style="padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; gap: 4px;">
                        <select onchange="updateUserRole('${u.email}', this.value)" style="
                            flex: 1; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1);
                            color: #aaa; padding: 2px; border-radius: 4px; font-size: 0.65rem; height: 22px; cursor: pointer; outline: none;
                        ">
                            <option value="" disabled selected>Role</option>
                            <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="fireman" ${role === 'fireman' ? 'selected' : ''}>Fireman</option>
                            <option value="citizen" ${role === 'citizen' ? 'selected' : ''}>Citizen</option>
                        </select>

                        ${role === 'fireman' ? `
                        <div style="width:100%; margin-top:4px;">
                            <select onchange="updateUserUnit('${u.email}', this.value)" style="
                                width: 100%; background: rgba(0,0,0,0.2); border: 1px solid rgba(14, 165, 233, 0.2);
                                color: #0ea5e9; padding: 2px; border-radius: 4px; font-size: 0.6rem; height: 20px; cursor: pointer;
                            ">
                                <option value="">Assign Unit</option>
                                ${state.units ? state.units.map(unit => `<option value="${unit.id}" ${u.unit_id == unit.id ? 'selected' : ''}>${unit.name}</option>`).join('') : ''}
                            </select>
                        </div>
                        <select onchange="updateUserStatus('${u.email}', this.value)" style="
                            flex: 1.2; background: rgba(0,0,0,0.2); border: 1px solid ${u.status === 'working' ? '#22c55e' : '#f97316'};
                            color: ${u.status === 'working' ? '#22c55e' : '#f97316'}; padding: 2px; border-radius: 4px; font-size: 0.65rem;
                            height: 22px; cursor: pointer; outline: none; font-weight: bold;
                        ">
                            <option value="available" ${u.status === 'available' || !u.status ? 'selected' : ''}>Offline</option>
                            <option value="working" ${u.status === 'working' ? 'selected' : ''}>On Duty</option>
                        </select>
                        ` : ''}
                    </div>
                </div>
            </div>`;
        }).join('');

        showToast("Directory Synced", `${users.length} personnel loaded`, "success");

    } catch (err) {
        grid.innerHTML = `<div style="padding:30px; text-align:center; color:#ef4444;">
            <p> Failed to load users: ${err.message}</p></div>`;
        showToast("Sync Error", err.message, "error");
    }
}
window.loadUsers = loadUsers;

async function updateUserUnit(email, unitId) {
    if (!unitId) return;
    try {
        const res = await fetchJSON('/api/users/update-unit', {
            method: 'POST',
            body: JSON.stringify({ email, unit_id: unitId })
        });
        if (res.success) {
            showToast("Unit Assigned", `Fireman linked to station successfully`, "success");
            loadUsers();
        }
    } catch (err) {
        showToast("Error", err.message, "error");
    }
}
window.updateUserUnit = updateUserUnit;

async function updateUserRole(email, newRole) {
    if (!newRole) return;
    try {
        const res = await fetchJSON('/api/users/update-role', {
            method: 'POST',
            body: JSON.stringify({ email, role: newRole })
        });
        if (res.success) {
            showToast("Role Updated", `${email}  ${newRole.toUpperCase()}`, "success");
            loadUsers(); // Refresh grid
        } else {
            showToast("Update Failed", res.error || "Unknown error", "error");
        }
    } catch (err) {
        showToast("Error", err.message, "error");
    }
}
window.updateUserRole = updateUserRole;

async function updateUserStatus(email, status) {
    try {
        const res = await fetchJSON('/api/users/update-status', {
            method: 'POST',
            body: JSON.stringify({ email, status })
        });
        if (res.success) {
            showToast("Status Updated", `${email} is now ${status}`, "success");
            loadUsers();
        } else {
            showToast("Update Failed", res.error || "Unknown error", "error");
        }
    } catch (err) {
        showToast("Error", err.message, "error");
    }
}
window.updateUserStatus = updateUserStatus;

async function toggleUserBlock(email, isBlocked) {
    try {
        const res = await fetchJSON('/api/users/toggle-block', {
            method: 'POST',
            body: JSON.stringify({ email, is_blocked: isBlocked })
        });
        if (res.success) {
            showToast("User Updated", `${email} is now ${isBlocked ? 'BLOCKED' : 'UNBLOCKED'}`, "success");
            loadUsers();
        } else {
            showToast("Update Failed", res.error || "Unknown error", "error");
        }
    } catch (err) {
        showToast("Error", err.message, "error");
    }
}
window.toggleUserBlock = toggleUserBlock;

async function deleteUser(email) {
    if (!confirm(`Are you sure you want to permanently delete user ${email}?`)) return;
    try {
        const res = await fetchJSON(`/api/users/${encodeURIComponent(email)}`, {
            method: 'DELETE'
        });
        if (res.success) {
            showToast("User Deleted", `${email} has been removed`, "success");
            loadUsers();
        } else {
            showToast("Delete Failed", res.error || "Unknown error", "error");
        }
    } catch (err) {
        showToast("Error", err.message, "error");
    }
}
window.deleteUser = deleteUser;

async function restoreUser(email) {
    if (!confirm(`Are you sure you want to restore user ${email}?`)) return;
    try {
        const res = await fetchJSON(`/api/users/restore`, {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        if (res.success) {
            showToast("User Restored", `${email} has been restored`, "success");
            loadUsers();
        } else {
            showToast("Restore Failed", res.error || "Unknown error", "error");
        }
    } catch (err) {
        showToast("Error", err.message, "error");
    }
}
window.restoreUser = restoreUser;
async function runAlgorithmComparison(targetLat, targetLng, targetSeverity, targetAreaType) {
            //    
            function renderComparisonTable(results) {
                if (!results || !results.length) return;
                //     
                const minTime = Math.min(...results.map(r => r.time));
                const minCost = Math.min(...results.map(r => r.cost));
                const minLoss = Math.min(...results.map(r => 100 - r.reliability));
                const maxReliability = Math.max(...results.map(r => r.reliability));
                const minDistance = Math.min(...results.map(r => r.distance));

                let html = `<table style="width:100%; border-collapse:separate; border-spacing:0 8px; margin-top:15px;">
                    <thead>
                        <tr style="background: rgba(167, 139, 250, 0.1); backdrop-filter: blur(10px); border-radius: 10px;">
                            <th style='padding:15px; text-align:left; color:#a78bfa; font-size:0.8rem; text-transform:uppercase; border-radius:10px 0 0 10px;'>Tactical Engine</th>
                            <th style='padding:15px; color:#fff; font-size:0.8rem;'>\u23F1\uFE0F Time</th>
                            <th style='padding:15px; color:#fff; font-size:0.8rem;'>\uD83D\uDCB0 Cost</th>
                            <th style='padding:15px; color:#3b82f6; font-size:0.8rem;'>\uD83D\uDE92 Trucks</th>
                            <th style='padding:15px; color:#f97316; font-size:0.8rem;'> Helis</th>
                            <th style='padding:15px; color:#00ff88; font-size:0.8rem;'> Drones</th>
                            <th style='padding:15px; color:#fff; font-size:0.8rem; border-radius:0 10px 10px 0;'>\u2705 Reliability</th>
                        </tr>
                    </thead>
                    <tbody>`;
                results.forEach(r => {
                    const isBest = r.reliability == maxReliability;
                    html += `<tr style='background: rgba(255,255,255,0.03); transition: transform 0.2s; cursor: default;' onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                        <td style='padding:18px 15px; text-align:left; border-radius:10px 0 0 10px; border-left: 3px solid ${isBest ? 'var(--primary)' : 'transparent'};'>
                            <div style="font-weight:800; color:#fff; font-size:0.95rem;">${r.name.split(' ')[0]}</div>
                            <div style="font-size:0.7rem; color:rgba(255,255,255,0.3);">${r.name.includes('Hybrid') ? 'Multi-Swarm' : r.name.includes('Genetic') ? 'Evolutionary' : 'Mathematical'}</div>
                        </td>
                        <td style='padding:18px 15px; text-align:center; ${r.time==minTime?"color:#22c55e;":""}'>${r.time}s</td>
                        <td style='padding:18px 15px; text-align:center; ${r.cost==minCost?"color:#22c55e;":""}'>${r.cost} DA</td>
                        <td style='padding:18px 15px; text-align:center; color:#3b82f6; font-family:monospace;'>${r.trucks || 0}</td>
                        <td style='padding:18px 15px; text-align:center; color:#f97316; font-family:monospace;'>${r.helis || 0}</td>
                        <td style='padding:18px 15px; text-align:center; color:#00ff88; font-family:monospace;'>${r.drones || 0}</td>
                        <td style='padding:18px 15px; text-align:center; border-radius:0 10px 10px 0; ${isBest?"color:#22c55e; font-weight:800;":""}'>${r.reliability}%</td>
                    </tr>`;
                });
                html += `</tbody></table>`;
                const tableDiv = document.getElementById('sci-comparison-table');
                if (tableDiv) tableDiv.innerHTML = html;
            }
    const statusField = document.getElementById('scientific-status');
    const container = document.getElementById('comparison-summary');
    const runBtn = event?.target || document.querySelector('.algo-action-btn[onclick*="runAlgorithmComparison"]');
    if (runBtn) {
        runBtn.disabled = true;
        runBtn.innerHTML = ' ANALYZING...';
        runBtn.style.opacity = '0.7';
    }
    
    if (statusField) statusField.innerText = "\uD83D\uDE80 Benchmarking algorithms on Python backend...";
    if (container) container.innerHTML = '<div style="padding: 20px; text-align: center; color: #aaa;">Running Python Optimizers...</div>';
    
    const lat = targetLat || state.lastClickedLocation?.lat || 36.1653;
    const lng = targetLng || state.lastClickedLocation?.lng || 1.3345;
    const severity = targetSeverity || document.getElementById('input-severity')?.value || 'high';
    const area_type = targetAreaType || document.getElementById('input-area')?.value || 'Urban';
    
    // Extract real-time weather metrics
    const windStr = document.getElementById('report-wind-val')?.value || "0";
    const tempStr = document.getElementById('report-temp-val')?.value || "20";
    const rainStr = document.getElementById('report-rain-val')?.value || "0";
    const wind = parseFloat(windStr) || 0;
    const temp = parseFloat(tempStr) || 20;
    const rain = parseFloat(rainStr) || 0;

    try {
        const response = await fetch('/api/benchmark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng, severity, area_type, wind, temp, rain })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || "Backend benchmark failed");
        }
        
        const data = await response.json();
        
        // --- Updated for GWO Solutions ---
        let results = data.results;
        
        // Determine best algorithm based on reliability
        let bestAlgo = results[0]; 

        if (statusField) {
            statusField.innerText = `BEST: ${bestAlgo.name} (${bestAlgo.reliability}%)`;
        }

        const sciExplanation = document.getElementById('sci-explanation');
        if (sciExplanation) {
            if (data.tactical_advice) {
                sciExplanation.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 1.5rem;">👨‍✈️</span>
                        <div style="color: #fff; font-weight: 600;">TACTICAL ADVISOR: ${data.tactical_advice}</div>
                    </div>
                `;
                sciExplanation.style.borderLeft = "4px solid #a78bfa";
                sciExplanation.style.background = "rgba(167, 139, 250, 0.05)";
            } else {
                sciExplanation.innerText = `Best Algorithm: ${bestAlgo.name} (Reliability: ${bestAlgo.reliability}%)`;
            }
        }

        const sciSelectedName = document.getElementById('sci-selected-algo-name');
        const sciSelectedContainer = document.getElementById('sci-selected-algo-container');
        if (sciSelectedName) sciSelectedName.innerText = bestAlgo.name;
        if (sciSelectedContainer) sciSelectedContainer.style.display = 'flex';

        // Update Small Cards with best algorithm results
        document.getElementById('sci-metric-distance').innerText = bestAlgo.distance;
        document.getElementById('sci-metric-time').innerText = bestAlgo.time + 's';
        document.getElementById('sci-metric-cost').innerText = bestAlgo.cost;
        document.getElementById('sci-metric-losses').innerText = (100 - bestAlgo.reliability).toFixed(1) + '%';

        renderComparisonChart(results);
        renderComparisonMatrix(results);
        renderComparisonTable(results);
        showToast("Analysis Complete", "Scenario benchmarked via Python successfully.", "success");

    } catch (err) {
        console.error(err);
        if (statusField) statusField.innerText = "Error during scientific analysis.";
        showToast("Analysis Error", err.message, "error");
    } finally {
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.innerHTML = '\uD83D\uDE80 RUN BENCHMARK';
            runBtn.style.opacity = '1';
        }
    }
}
window.runAlgorithmComparison = runAlgorithmComparison;

let comparisonChartInstance = null;
function renderComparisonChart(results) {
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;
    if (comparisonChartInstance) comparisonChartInstance.destroy();

    comparisonChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: results.map(r => r.name.split(' ')[0]),
            datasets: [
                {
                    label: 'Reliability (%)',
                    data: results.map(r => r.reliability),
                    backgroundColor: results.map(r => r.name.includes('Hybrid') ? '#f97316' : 'rgba(255, 255, 255, 0.1)'),
                    borderColor: '#f97316',
                    borderWidth: 1
                },
                {
                    label: 'Efficiency Curve',
                    data: results.map(r => (r.reliability + (100 - r.time)) / 2),
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    type: 'line',
                    tension: 0.4,
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#aaa' } } },
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                x: { ticks: { color: '#888' }, grid: { display: false } }
            }
        }
    });
}

function renderComparisonMatrix(results) {
    const summaryDiv = document.getElementById('comparison-summary');
    if (!summaryDiv) return;

    summaryDiv.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px; height: 100%; overflow-y: auto; padding-right: 5px;">
            ${results.map(r => {
                const isBest = r.name.includes('Hybrid');
                return `
                <div onclick="updateScientificCards('${r.name}')" style="
                    background: rgba(255,255,255,0.03); 
                    border: 1px solid ${isBest ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; 
                    border-radius: 10px; 
                    padding: 12px; 
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 700; font-size: 0.85rem; color: ${isBest ? 'var(--primary)' : '#fff'}">${r.name.split(' ')[0]}</span>
                        ${isBest ? '<span style="background: var(--primary); color: #000; font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; font-weight: 800;">TOP</span>' : ''}
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.7rem; color: #aaa;">
                        <div>\u23F1\uFE0F ${r.time}s</div>
                        <div>\uD83D\uDCCD ${r.distance}km</div>
                        <div>\uD83D\uDCB0 ${r.cost} DA</div>
                        <div style="color: ${r.reliability > 90 ? '#22c55e' : '#ff9800'}">\u2705 ${r.reliability}%</div>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;

    // Add a global function to update the big cards when clicking a small one
    window.updateScientificCards = (name) => {
        const r = results.find(item => item.name === name);
        if (!r) return;
        
        document.getElementById('sci-metric-distance').innerText = r.distance.toFixed(1);
        document.getElementById('sci-metric-time').innerText = r.time + 's';
        document.getElementById('sci-metric-cost').innerText = r.cost;
        document.getElementById('sci-metric-losses').innerText = (100 - r.reliability).toFixed(1) + '%';
        
        // Show the scientific basis / logic
        const statusField = document.getElementById('scientific-status');
        if (statusField) statusField.innerText = r.logic;
        
        showToast("Analyse Scientifique", `Logic: ${r.name.split(' ')[0]} optimization basis`, "info");
    };
}

// ==========================================
//  LOGOUT HANDLER
// ==========================================
async function handleLogout() {
    if (!confirm('Are you sure you want to logout?')) return;
    
    try {
        showToast("Logging out", "Closing session...", "info");
        await fetch('/logout', { method: 'GET' });
        window.location.href = '/';
    } catch (err) {
        console.error('Logout error:', err);
        showToast("Error", "Logout failed: " + err.message, "error");
    }
}

// Make handleLogout globally accessible
window.handleLogout = handleLogout;

// ==========================================
//  ADMIN DASHBOARD FUNCTIONS
// ==========================================
async function refreshAdminData() {
    showToast("Refreshing", "Updating all data...", "info");
    try {
        await Promise.all([
            refreshData(),
            loadAdminDashboardData(),
            loadWaterSources()
        ]);
        showToast("Success", "All data refreshed", "success");
    } catch (err) {
        showToast("Error", "Failed to refresh: " + err.message, "error");
    }
}

function clearAllAdminData() {
    if (!confirm('Are you sure you want to clear all incident data? This cannot be undone!')) return;
    
    showToast("Clearing", "Please wait...", "warning");
    // This would call a backend endpoint to clear all data
    // For now, just clear local state
    state.alerts = [];
    state.dispatches = [];
    renderMapData();
    showToast("Cleared", "All incidents cleared", "info");
}

async function saveTacticalConfiguration() {
    showToast("Syncing...", "Synchronizing tactical resource states with Cloud Database", "warning");
    
    try {
        await loadAdminDashboardData();
        await loadMaintenanceData();
        
        setTimeout(() => {
            showToast("Success", "All station resources and equipment statuses have been committed.", "info");
        }, 800);
    } catch (err) {
        showToast("Sync Error", "Failed to commit layout changes", "error");
    }
}
window.saveTacticalConfiguration = saveTacticalConfiguration;

async function loadAdminDashboardData() {
    const container = document.getElementById('admin-table-content');
    if (!container) return;

    try {
        // Fetch units data
        const unitsResponse = await fetch('/api/units');
        const units = await unitsResponse.json();
        state.units = units;

        if (!units || units.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 60px 20px; text-align: center;">
                    <div style="font-size: 3rem; margin-bottom: 15px;">\uD83D\uDCE1</div>
                    <div style="color: rgba(255,255,255,0.5); font-size: 0.95rem;">No units configured</div>
                </div>
            `;
            return;
        }

        // Create table HTML
        let tableHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid rgba(255,140,66,0.2); background: rgba(255,140,66,0.05);">
                            <th style="padding: 12px; text-align: left; color: #ff8c42; font-weight: 600; font-size: 0.85rem;">Unit Name</th>
                            <th style="padding: 12px; text-align: left; color: #ff8c42; font-weight: 600; font-size: 0.85rem;">Coordinates</th>
                            <th style="padding: 12px; text-align: left; color: #ff8c42; font-weight: 600; font-size: 0.85rem;">Vehicles</th>
                            <th style="padding: 12px; text-align: left; color: #ff8c42; font-weight: 600; font-size: 0.85rem;">Equipment</th>
                            <th style="padding: 12px; text-align: center; color: #ff8c42; font-weight: 600; font-size: 0.85rem;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        units.forEach((unit, idx) => {
            const rowBg = idx % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent';
            
            // Generate labels from backend 
            let eqBadge = '';
            const details = unit.equipment_details || [];
            
            if (details.length > 0) {
                eqBadge = details.map(eq => {
                    const isBroken = eq.status === 'on_pan' || eq.status === 'maintenance' || eq.status === 'busy';
                    let statusColor = '#22c55e';
                    let statusBg = 'rgba(34, 197, 94, 0.1)';
                    let icon = '';

                    if (eq.status === 'on_pan' || eq.status === 'maintenance') {
                        statusColor = '#ef4444';
                        statusBg = 'rgba(239, 68, 68, 0.1)';
                        icon = '🚨';
                    } else if (eq.status === 'busy') {
                        statusColor = '#3b82f6';
                        statusBg = 'rgba(59, 130, 246, 0.1)';
                        icon = '🛰️';
                    }

                    return `
                        <span onclick="toggleEquipmentStatus(${eq.id}, '${eq.status}')" 
                              title="Status: ${eq.status.toUpperCase()} - Click to toggle Maintenance"
                              style="background:${statusBg}; color:${statusColor}; padding:4px 10px; border-radius:15px; font-size:0.7rem; margin-right:5px; border:1px solid ${statusColor}; display:inline-block; margin-bottom:3px; cursor: pointer; transition: all 0.2s;">
                            ${icon} ${eq.type}
                        </span>
                    `;
                }).join('');
            } else {
                eqBadge = `<span style="background:rgba(255,140,66,0.15); color:#ff8c42; padding:4px 10px; border-radius:12px; font-size:0.75rem;">No Equipment Registered</span>`;
            }

            tableHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: ${rowBg}; transition: background 0.2s;
                    color: #fff;
                    font-weight: 500;
                    text-align: left;
                ">
                    <td style="padding: 12px 15px; color: #fff; font-weight: 700; font-size: 0.95rem;">${unit.name || 'Unknown'}</td>
                    <td style="padding: 12px 15px; color: #aaa; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;">
                        ${(unit.lat || 36.1653).toFixed(4)}, ${(unit.lng || 1.3345).toFixed(4)}
                    </td>
                    <td style="padding: 12px 15px;">
                        <span style="background: #1e293b; color: #fff; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 700; border: 1px solid #3b82f6; display: inline-block; min-width: 70px; text-align: center;">
                            ${unit.vehicle_count || 0} Vehicles
                        </span>
                    </td>
                    <td style="padding: 12px 15px;">
                        <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                            ${eqBadge}
                        </div>
                    </td>
                    <td style="padding: 12px 15px; text-align: center;">
                        <div style="display: flex; gap: 5px; justify-content: center;">
                            <button onclick="map.flyTo([${unit.lat}, ${unit.lng}], 18); setMode('dashboard');" style="background:#3b82f6; border:none; color:white; padding:4px 12px; border-radius:6px; display:inline-flex; flex-direction:row; align-items:center; gap:4px; font-size:0.8rem; font-weight: bold; cursor: pointer; white-space: nowrap; height: 30px;">
                                📍 View
                            </button>
                            <button onclick="toggleUnitStatus(${unit.id}, '${unit.status}')" style="background:${unit.status === 'active' ? 'rgba(239, 68, 68, 0.1)' : '#22c55e'}; border: 1px solid ${unit.status === 'active' ? '#ef4444' : '#22c55e'}; color: ${unit.status === 'active' ? '#ef4444' : '#fff'}; padding:4px 12px; border-radius:6px; font-size:0.8rem; font-weight: bold; cursor: pointer; white-space: nowrap; height: 30px;">
                                ${unit.status === 'active' ? '🚨 En Panne' : '✅ Active'}
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tableHTML += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHTML;
        showToast("Loaded", `${units.length} units in system`, "success");

    } catch (err) {
        console.error('Load admin data error:', err);
        container.innerHTML = `
            <div class="empty-state" style="padding: 40px; text-align: center; color: #ef4444;">
                <p> Failed to load units: ${err.message}</p>
            </div>
        `;
        showToast("Error", "Failed to load units data", "error");
    }
}

async function toggleUnitStatus(unitId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'on_pan' : 'active';
    try {
        const res = await fetchJSON(`/api/units/${unitId}/status`, {
            method: 'POST',
            body: JSON.stringify({ status: newStatus })
        });
        if (res.success) {
            showToast("Unit Updated", `Status changed to ${newStatus.toUpperCase()}`, "success");
            loadAdminDashboardData();
            if (state.currentMode === 'maintenance') loadMaintenanceData();
        }
    } catch (err) {
        showToast("Error", err.message, "error");
    }
}
window.toggleUnitStatus = toggleUnitStatus;

async function toggleEquipmentStatus(equipId, currentStatus) {
    // Toggle between available and on_pan
    const newStatus = (currentStatus === 'on_pan' || currentStatus === 'maintenance') ? 'available' : 'on_pan';
    
    try {
        const res = await fetchJSON(`/api/equipment/${equipId}/status`, {
            method: 'POST',
            body: JSON.stringify({ status: newStatus })
        });
        if (res.success) {
            showToast("Resource Updated", `Asset is now ${newStatus.toUpperCase()}`, "success");
            loadAdminDashboardData();
            loadMaintenanceData();
        }
    } catch (err) {
        showToast("Error", err.message, "error");
    }
}
window.toggleEquipmentStatus = toggleEquipmentStatus;

function editUnit(unitId) {
    showToast("Edit Mode", `Loading unit ${unitId}...`, "info");
    // Implementation for editing unit
    setMode('unit');
}

// Make functions globally accessible
window.refreshAdminData = refreshAdminData;
window.clearAllAdminData = clearAllAdminData;
window.loadAdminDashboardData = loadAdminDashboardData;
window.editUnit = editUnit;

// ==========================================
//  SIDEBAR WEATHER WIDGET UPDATES
// ==========================================
async function updateSidebarWeather(zone = 'chlef') {
    const tempEl = document.getElementById('sidebar-temp');
    const windEl = document.getElementById('sidebar-wind');
    const rainEl = document.getElementById('sidebar-rain');
    const locEl = document.getElementById('sidebar-location');

    if (!tempEl) return;

    try {
        // Find coordinates for zone
        const coords = {
            'chlef': [36.16, 1.33],
            'algiers': [36.75, 3.05],
            'oran': [35.69, -0.63],
            'setif': [36.19, 5.41],
            'constantine': [36.36, 6.61]
        };
        const [lat, lon] = coords[zone.toLowerCase()] || coords['chlef'];

        const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
        const data = await response.json();
        
        // Update with animation
        tempEl.style.opacity = '0.5';
        windEl.style.opacity = '0.5';
        rainEl.style.opacity = '0.5';
        
        setTimeout(() => {
            tempEl.textContent = `${data.temperature}C`;
            windEl.textContent = `${data.wind_speed} km/h`;
            rainEl.textContent = `${data.rain_mm} mm`;
            locEl.textContent = zone.charAt(0).toUpperCase() + zone.slice(1);
            
            tempEl.style.opacity = '1';
            windEl.style.opacity = '1';
            rainEl.style.opacity = '1';
        }, 200);
        
    } catch (err) {
        console.error('Weather update error:', err);
    }
}

function getZoneFromCoordinates(lat, lng) {
    if (lat > 36.0 && lat < 36.5 && lng > 0.5 && lng < 2.0) return 'chlef';
    if (lat > 36.6 && lat < 36.9 && lng > 2.8 && lng < 3.2) return 'algiers';
    if (lat > 35.5 && lat < 35.8 && lng > -0.8 && lng < -0.4) return 'oran';
    if (lat > 36.1 && lat < 36.3 && lng > 5.3 && lng < 5.6) return 'setif';
    if (lat > 36.2 && lat < 36.5 && lng > 6.5 && lng < 6.8) return 'constantine';
    if (lat > 34.8 && lat < 35.0 && lng > 5.7 && lng < 6.0) return 'biskra';
    if (lat > 36.7 && lat < 36.9 && lng > 5.0 && lng < 5.3) return 'bejaia';
    if (lat > 36.7 && lat < 36.9 && lng > 7.6 && lng < 7.9) return 'annaba';
    if (lat > 32.4 && lat < 32.6 && lng > 3.6 && lng < 3.9) return 'ghardaia';
    return 'chlef';
}

// Call on zone selection
window.updateSidebarWeather = updateSidebarWeather;

// --- Weather Widget for Fireman Tactical Page ---
function fetchAndDisplayWeather(lat = 36.1653, lon = 1.3345) {
    fetch(`/api/weather?lat=${lat}&lon=${lon}`)
        .then(response => response.json())
        .then(data => {
            console.log("Weather data received:", data);
            
            // 0. Update Centralized Pill (Top Bar)
            const pillTemp = document.getElementById('pill-temp');
            const pillWind = document.getElementById('pill-wind');
            const pillRain = document.getElementById('pill-rain');
            const pillLoc  = document.getElementById('pill-location');
            
            if (pillTemp) pillTemp.textContent = `🌡️ ${data.temperature}C`;
            if (pillWind) pillWind.textContent = `💨 ${data.wind_speed} km/h`;
            if (pillRain) pillRain.textContent = `🌧️ ${data.rain_mm || '0.0'} mm/h`;
            if (pillLoc) {
                const zone = getZoneFromCoordinates(lat, lon);
                pillLoc.textContent = `\uD83D\uDCCD ${zone.charAt(0).toUpperCase() + zone.slice(1)} Area`;
            }
            
            // 1. Update Dashboard Stats (Arabic)
            const tempDashboard = document.getElementById('weather-temp');
            const windDashboard = document.getElementById('weather-wind');
            const rainDashboard = document.getElementById('weather-rain');
            if (tempDashboard) tempDashboard.textContent = `${data.temperature}C`;
            if (windDashboard) windDashboard.textContent = `${data.wind_speed} /`;
            if (rainDashboard) rainDashboard.textContent = `${data.rain_mm || '0.0'} /`;

            // 1.5 Update Fireman Sidebar Stats (Arabic)
            const sidebarTemp = document.getElementById('sidebar-temp');
            const sidebarWind = document.getElementById('sidebar-wind');
            const sidebarRain = document.getElementById('sidebar-rain');
            if (sidebarTemp) sidebarTemp.textContent = `${data.temperature}C`;
            if (sidebarWind) sidebarWind.textContent = `${data.wind_speed} /`;
            if (sidebarRain) sidebarRain.textContent = `${data.rain_mm || '0.0'} /`;

            // 2. Update Incident Report Card (Editable fields)
            const rainReport = document.getElementById('report-rain-val');
            const windReport = document.getElementById('report-wind-val');
            const tempReport = document.getElementById('report-temp-val');
            if (rainReport) rainReport.value = `${data.rain_mm || '0.0'} mm/h`;
            if (windReport) windReport.value = `${data.wind_speed} km/h`;
            if (tempReport) tempReport.value = `${data.temperature}C`;

            // 3. Update Detailed Weather Panel (Google Style)
            const pRainVal = document.getElementById('weather-panel-rain-val');
            const pTempVal = document.getElementById('weather-panel-temp-val');
            const pWindVal = document.getElementById('weather-panel-wind-val');
            const pStatusTitle = document.getElementById('weather-status-title');
            const pStatusDesc = document.getElementById('weather-status-desc');

            if (pRainVal) pRainVal.textContent = data.rain_mm || '0';
            if (pTempVal) pTempVal.textContent = `${data.temperature}°C`;
            if (pWindVal) pWindVal.textContent = `${data.wind_speed} كم/س`;
            
            if (pStatusTitle && pStatusDesc) {
                if ((data.rain_mm || 0) > 0) {
                    pStatusTitle.textContent = "هناك احتمال لهطول الأمطار حالياً";
                    pStatusDesc.textContent = "يرجى أخذ الحيطة والحذر أثناء التدخلات التكتيكية.";
                } else {
                    pStatusTitle.textContent = "ليس هناك احتمالية لهطول الأمطار/تساقط الثلوج";
                    pStatusDesc.textContent = "لا تهطل الأمطار خلال الـ 24 ساعة القادمة.";
                }
            }

            // 4. Update Weather Widget (if exists)
            const widget = document.getElementById('weather-widget');
            if (widget) {
                if (data.error) {
                    widget.innerHTML = `<div class="weather-error">   </div>`;
                } else {
                    widget.innerHTML = `
                        <div class="weather-box" style="background:rgba(0,0,0,0.5); border-radius:10px; padding:10px 18px; color:#fff; display:flex; align-items:center; gap:18px; font-size:1.1em;">
                            <span> <b>${data.temperature}C</b></span>
                            <span> <b>${data.wind_speed} /</b></span>
                            <span> <b>${data.rain_mm || '0.0'} /</b></span>
                        </div>
                    `;
                }
            }
        })
        .catch(err => {
            console.error("Weather fetch failed:", err);
            const widget = document.getElementById('weather-widget');
            if (widget) widget.innerHTML = '<div class="weather-error">   </div>';
        });
}

// Weather Panel Toggle
function toggleWeatherPanel() {
    const panel = document.getElementById('weather-panel');
    if (!panel) return;
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    
    if (isHidden) {
        const lat = state.lastClickedLocation ? state.lastClickedLocation.lat : 36.1653;
        const lng = state.lastClickedLocation ? state.lastClickedLocation.lng : 1.3345;
        fetchAndDisplayWeather(lat, lng);
    }
}
window.toggleWeatherPanel = toggleWeatherPanel;

//      


// ==========================================
// ==========================================
// 💧 WATER SOURCE MANAGEMENT
// ==========================================

async function loadWaterSources() {
    const container = document.getElementById('water-table-content');
    if (!container) return;

    try {
        const url = `/api/water?show_deleted=${state.showArchivedZones}`;
        const response = await fetch(url);
        const sources = await response.json();

        if (!sources || sources.length === 0) {
            container.innerHTML = `<div class="empty-state">${state.showArchivedZones ? 'No archived sources' : 'No active water sources configured'}</div>`;
            return;
        }

        let html = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid rgba(14, 165, 233, 0.2); background: rgba(14, 165, 233, 0.05);">
                            <th style="padding: 12px; text-align: left; color: #0ea5e9; font-weight: 600;">Resource Name</th>
                            <th style="padding: 12px; text-align: left; color: #0ea5e9; font-weight: 600;">Location</th>
                            <th style="padding: 12px; text-align: left; color: #0ea5e9; font-weight: 600;">Capacity</th>
                            <th style="padding: 12px; text-align: center; color: #0ea5e9; font-weight: 600;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        sources.forEach((source, idx) => {
            const rowBg = idx % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent';
            const isDeleted = source.is_deleted;
            
            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: ${rowBg}; opacity: ${isDeleted ? '0.6' : '1'}">
                    <td style="padding: 10px; color: #fff; font-weight: 500;">
                        ${source.name} ${isDeleted ? '<span style="font-size:0.7rem; color:#ef4444; border:1px solid #ef4444; padding:1px 4px; border-radius:4px; margin-left:5px;">ARCHIVED</span>' : ''}
                    </td>
                    <td style="padding: 10px; color: #aaa; font-family: monospace;">${source.lat.toFixed(4)}, ${source.lng.toFixed(4)}</td>
                    <td style="padding: 10px;">
                        <span style="background: rgba(14, 165, 233, 0.15); color: #0ea5e9; padding: 2px 8px; border-radius: 4px; font-weight: 600;">
                            ${source.capacity}
                        </span>
                    </td>
                    <td style="padding: 10px; text-align: center; display: flex; gap: 5px; justify-content: center;">
                        <button class="btn-action-premium" onclick="centerMap(${source.lat}, ${source.lng})" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(255,255,255,0.05);">Map</button>
                        ${isDeleted ? 
                            `<button class="btn-action-premium" onclick="restoreAsset('water', ${source.id})" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(34, 197, 94, 0.2); color: #22c55e; border-color: #22c55e;">Restore</button>` :
                            `<button class="btn-action-premium" onclick="deleteAsset('water', ${source.id})" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.2); color: #ef4444; border-color: #ef4444;">Delete</button>`
                        }
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="error-text">Failed to load water data: ${err.message}</div>`;
    }
}

async function loadZonesTable() {
    const container = document.getElementById('zones-table-content');
    if (!container) return;

    try {
        const url = `/api/zones?show_deleted=${state.showArchivedZones}`;
        const response = await fetch(url);
        const zones = await response.json();

        if (!zones || zones.length === 0) {
            container.innerHTML = `<div class="empty-state">${state.showArchivedZones ? 'No archived zones' : 'No tactical zones configured'}</div>`;
            return;
        }

        let html = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid rgba(34, 197, 94, 0.2); background: rgba(34, 197, 94, 0.05);">
                            <th style="padding: 12px; text-align: left; color: #22c55e; font-weight: 600;">Zone Name</th>
                            <th style="padding: 12px; text-align: left; color: #22c55e; font-weight: 600;">Type</th>
                            <th style="padding: 12px; text-align: left; color: #22c55e; font-weight: 600;">Risk</th>
                            <th style="padding: 12px; text-align: center; color: #22c55e; font-weight: 600;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        zones.forEach((zone, idx) => {
            const rowBg = idx % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent';
            const isDeleted = zone.is_deleted;
            const riskColor = zone.risk_level === 'critical' ? '#ef4444' : (zone.risk_level === 'high' ? '#f97316' : '#22c55e');

            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: ${rowBg}; opacity: ${isDeleted ? '0.6' : '1'}">
                    <td style="padding: 10px; color: #fff; font-weight: 500;">
                        ${zone.name} ${isDeleted ? '<span style="font-size:0.7rem; color:#ef4444; border:1px solid #ef4444; padding:1px 4px; border-radius:4px; margin-left:5px;">ARCHIVED</span>' : ''}
                    </td>
                    <td style="padding: 10px; color: #aaa;">${zone.hazard_type || 'Unknown'}</td>
                    <td style="padding: 10px;">
                        <span style="border: 1px solid ${riskColor}; color: ${riskColor}; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; text-transform: uppercase; font-weight: 700;">
                            ${zone.risk_level}
                        </span>
                    </td>
                    <td style="padding: 10px; text-align: center; display: flex; gap: 5px; justify-content: center;">
                        <button class="btn-action-premium" onclick="centerMap(${zone.center_lat}, ${zone.center_lng})" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(255,255,255,0.05);">Map</button>
                        ${isDeleted ? 
                            `<button class="btn-action-premium" onclick="restoreAsset('zones', ${zone.id})" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(34, 197, 94, 0.2); color: #22c55e; border-color: #22c55e;">Restore</button>` :
                            `<button class="btn-action-premium" onclick="deleteAsset('zones', ${zone.id})" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.2); color: #ef4444; border-color: #ef4444;">Delete</button>`
                        }
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="error-text">Failed to load zones data: ${err.message}</div>`;
    }
}

function toggleZoneArchive() {
    state.showArchivedZones = !state.showArchivedZones;
    const btn = document.getElementById('btn-toggle-zone-archive');
    if (btn) {
        btn.innerText = state.showArchivedZones ? "👁️ Hide Archived Assets" : "👁️ Show Archived Assets";
        btn.style.background = state.showArchivedZones ? "rgba(239, 68, 68, 0.1)" : "rgba(255,255,255,0.05)";
    }
    loadWaterSources();
    loadZonesTable();
}

async function deleteAsset(type, id) {
    if (!confirm(`Are you sure you want to archive this ${type.slice(0,-1)}? It will be removed from situational awareness but kept in records.`)) return;
    
    try {
        const response = await fetch(`/api/${type}/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            showToast("Asset Archived", "The tactical resource has been moved to archives.", "info");
            loadWaterSources();
            loadZonesTable();
            if (typeof renderMapData === 'function') renderMapData();
        } else {
            showToast("Error", result.error || "Failed to archive asset", "error");
        }
    } catch (err) {
        showToast("Error", "Network failure during archival", "error");
    }
}

async function restoreAsset(type, id) {
    try {
        const response = await fetch(`/api/${type}/${id}/restore`, { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            showToast("Asset Restored", "The tactical resource is now active again.", "success");
            loadWaterSources();
            loadZonesTable();
            if (typeof renderMapData === 'function') renderMapData();
        } else {
            showToast("Error", result.error || "Failed to restore asset", "error");
        }
    } catch (err) {
        showToast("Error", "Network failure during restoration", "error");
    }
}

function centerMap(lat, lng) {
    if (map) {
        map.setView([lat, lng], 18);
        const wrapper = document.getElementById('map-card-wrapper');
        if (typeof toggleMapView === 'function' && wrapper && !wrapper.classList.contains('expanded')) {
            toggleMapView();
        }
    }
}

// Modal Triggers for Map Selection
function startAssetSelection(mode, instructionText) {
    state.currentMode = mode;
    state.lastClickedLocation = null;
    document.getElementById("map-overlay-container").classList.remove("hidden");
    const instruction = document.querySelector(".map-instruction");
    if (instruction) instruction.innerText = instructionText;
    const confirmBtn = document.getElementById("map-confirm-btn");
    if (confirmBtn) {
        confirmBtn.innerText = "  (Confirm Location)";
        confirmBtn.disabled = true; // Wait for click
    }
    
    // Hide panels and expand map
    document.querySelectorAll(".dashboard-panel-section").forEach((p) => p.classList.add("hidden"));
    const mapWrapper = document.getElementById('map-card-wrapper');
    if (mapWrapper && !mapWrapper.classList.contains('expanded')) {
        mapWrapper.classList.remove('collapsed');
        mapWrapper.classList.add('expanded');
        setTimeout(() => { if (typeof map !== 'undefined') map.invalidateSize(); }, 400);
    }
    
    showToast(" ", "      ", "info");
}

function showAddWaterSourceModal() { startAssetSelection('addWater', '\uD83D\uDCA7       '); }
function showAddStationModal() { startAssetSelection('addStation', '\uD83D\uDE92      '); }
function showAddZoneModal() { 
    document.getElementById('zoneHazardType').value = 'Forest';
    startAssetSelection('addZone', '      '); 
}
function showAddIndustrialZoneModal() { 
    document.getElementById('zoneHazardType').value = 'Industrial';
    startAssetSelection('addIndustrial', '🏭 Select Industrial Location'); 
}

function saveMapChanges() {
    showToast("System Sync", "All tactical map modifications have been saved to the central registry.", "success");
    refreshData();
}


// Form Submissions
async function submitAddWater(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch('/api/water', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const res = await response.json();
        if (res.success) {
            showToast("Success", "Water source added successfully", "success");
            document.getElementById('addWaterModal').classList.add('hidden');
            loadWaterSources();
            renderMapData(); // Refresh map markers
        } else {
            showToast("Error", res.error || "Failed to add water source", "error");
        }
    } catch (err) {
        showToast("Error", "Network error occurred", "error");
    }
}

async function submitAddStation(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch('/api/units', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const res = await response.json();
        if (res.success) {
            showToast("Success", "Fire station added with tactical equipment", "success");
            document.getElementById('addStationModal').classList.add('hidden');
            loadAdminDashboardData();
            renderMapData();
        } else {
            showToast("Error", res.error || "Failed to add station", "error");
        }
    } catch (err) {
        showToast("Error", "Network error occurred", "error");
    }
}

async function submitAddZone(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch('/api/zones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const res = await response.json();
        if (res.success) {
            showToast("Success", "Tactical zone defined", "success");
            document.getElementById('addZoneModal').classList.add('hidden');
            loadAdminDashboardData(); // Refresh data from server to include new zone
            renderMapData();
        } else {
            showToast("Error", res.error || "Failed to add zone", "error");
        }
    } catch (err) {
        showToast("Error", "Network error occurred", "error");
    }
}

// Global exposure
window.showAddWaterSourceModal = showAddWaterSourceModal;
window.showAddStationModal = showAddStationModal;
window.showAddZoneModal = showAddZoneModal;
window.showAddIndustrialZoneModal = showAddIndustrialZoneModal;
window.submitAddWater = submitAddWater;
window.submitAddStation = submitAddStation;
window.submitAddZone = submitAddZone;
window.loadWaterSources = loadWaterSources;

// Auto-load on entry


// ==========================================
// \uD83D\uDE80 MULTI-ALGORITHM SELECTION LOGIC
// ==========================================
const selectedOptimizers = new Set();

function toggleAlgoSelection(card, algoId) {
    const checkbox = card.querySelector('input[type="checkbox"]');
    if (selectedOptimizers.has(algoId)) {
        selectedOptimizers.delete(algoId);
        card.classList.remove('selected');
        if (checkbox) checkbox.checked = false;
    } else {
        selectedOptimizers.add(algoId);
        card.classList.add('selected');
        if (checkbox) checkbox.checked = true;
    }
    
    // Update Run Button State
    const runBtn = document.getElementById('run-multi-opt-btn');
    if (runBtn) {
        if (selectedOptimizers.size > 0) {
            runBtn.style.opacity = '1';
            runBtn.style.pointerEvents = 'auto';
            runBtn.innerText = '\uD83D\uDE80 RUN COMPARISON (' + selectedOptimizers.size + ' ENGINES)';
        } else {
            runBtn.style.opacity = '0.6';
            runBtn.style.pointerEvents = 'none';
            runBtn.innerText = '\uD83D\uDE80 RUN COMPARATIVE OPTIMIZATION';
        }
    }
}
window.toggleAlgoSelection = toggleAlgoSelection;

async function runMultiOptimization() {
    const algos = Array.from(selectedOptimizers);
    if (algos.length === 0) {
        showToast("Error", "Please select at least one algorithm to run.", "error");
        return;
    }

    showToast("Optimization Hub", `Running comparison for ${algos.length} algorithms...`, "info");
    
    // Hide standard single-view dashboard
    const singleDashboard = document.getElementById('optimization-results-dashboard');
    if (singleDashboard) singleDashboard.classList.add('hidden');

    const multiResults = document.getElementById('optimization-results-multi');
    if (multiResults) {
        multiResults.innerHTML = '';
        multiResults.style.display = 'flex';
        multiResults.style.flexDirection = 'column'; // Stack vertically
        multiResults.style.gap = '20px';
    }

    const radarContainer = document.getElementById('multi-opt-radar-container');
    if (radarContainer) radarContainer.style.display = algos.length > 1 ? 'block' : 'none';

    // Global radar data
    const radarDatasets = [];
    const colors = ['#a78bfa', '#22c55e', '#3b82f6', '#f97316'];
    
    // Reset individual charts if they exist
    if (convergenceChart) { convergenceChart.destroy(); convergenceChart = null; }
    if (resourcePieChart) { resourcePieChart.destroy(); resourcePieChart = null; }
    if (globalRadarChart) { globalRadarChart.destroy(); globalRadarChart = null; }

    const areaType = document.getElementById('input-area')?.value || 'Urban';
    const lat = state.lastClickedLocation?.lat || 36.1653;
    const lng = state.lastClickedLocation?.lng || 1.3345;
    const severity = document.getElementById('input-severity')?.value || 'medium';

    for (let i = 0; i < algos.length; i++) {
        const algoId = algos[i];
        const algo = {
            'ip':     { label: 'Integer Programming (ILP)',    endpoint: '/api/optimize/ip',  method: 'ip' },
            'gp':     { label: 'Goal Programming',             endpoint: '/api/optimize/gp',  method: 'gp' },
            'nsga':   { label: 'NSGA-II & GA',                 endpoint: '/api/optimize',     method: 'nsga' },
            'hybrid': { label: 'Hybrid PSO-GWO Swarm',         endpoint: '/api/optimize',     method: 'hybrid' }
        }[algoId];
        
        if (!algo) continue;

        let payload = {};
        if (algoId === 'ip') {
            payload = { budget: 10000, horizon: 300, dominoTime: 30, scenario: 1, costTruck: 300, costHeli: 800, costDrone: 100, area_type: areaType };
        } else if (algoId === 'gp') {
            payload = { targetDamage: 400, targetCost: 4000, w1: 0.5, w2: 0.5, budget: 10000, horizon: 300, area_type: areaType };
        } else {
            payload = { lat, lng, severity, algorithm: algo.method, area_type: areaType };
        }

        let data = null;
        try {
            const response = await fetch(algo.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            data = await response.json();
        } catch (error) {
            console.error(`Failed to run ${algo.label}:`, error);
            if (multiResults) {
                multiResults.insertAdjacentHTML('beforeend', `
                <div class="dash-card" style="padding: 20px; border-left: 5px solid ${colors[i % colors.length]}; width: 100%;">
                    <h2 style="color: ${colors[i % colors.length]}; margin-top: 0;">${algo.label}</h2>
                    <div style="padding: 14px; border-radius: 8px; background: rgba(239, 68, 68, 0.12); color: #fecaca; border: 1px solid rgba(239, 68, 68, 0.35);">
                        Request failed for this algorithm (${String(error?.message || 'Unknown error')}).
                    </div>
                </div>`);
            }
            continue;
        }

        // Collect radar data for global comparison
        if (data.chart_data && data.chart_data.performance) {
            radarDatasets.push({
                label: algoId.toUpperCase(),
                data: data.chart_data.performance,
                backgroundColor: colors[i % colors.length] + '33',
                borderColor: colors[i % colors.length],
                pointBackgroundColor: colors[i % colors.length],
                borderWidth: 2
            });
        }
        
        // Render this specific algo's results in the dashboard dynamically
        if (multiResults) {
            const blockId = `algo-block-${algoId}`;
            const blockHtml = `
            <div id="${blockId}" class="dash-card" style="padding: 20px; border-left: 5px solid ${colors[i % colors.length]}; width: 100%;">
                <h2 style="color: ${colors[i % colors.length]}; margin-top: 0; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
                    ${algo.label}
                </h2>
                
                <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px;">
                        <h4 style="margin-bottom: 10px; color: #fff; font-size: 0.9rem;">\uD83D\uDCC9 Optimization Convergence</h4>
                        <div style="height: 220px;"><canvas id="convChart-${algoId}"></canvas></div>
                    </div>
                    <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px;">
                        <h4 style="margin-bottom: 10px; color: #fff; font-size: 0.9rem;">\uD83D\uDCCA Strategic Performance</h4>
                        <div style="height: 220px;"><canvas id="resChart-${algoId}"></canvas></div>
                    </div>
                </div>

                <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px;">
                    <h4 style="margin-bottom: 15px; color: #fff; font-size: 0.9rem;">\uD83D\uDCCB Tactical Deployment Blueprint</h4>
                    <div id="blueprint-${algoId}"></div>
                </div>
            </div>`;
            
            multiResults.insertAdjacentHTML('beforeend', blockHtml);
            
            if (data.chart_data) {
                const convCtx = document.getElementById(`convChart-${algoId}`);
                if (convCtx && data.chart_data.convergence) {
                    new Chart(convCtx, {
                        type: 'line',
                        data: {
                            labels: data.chart_data.convergence.map((_, idx) => `Gen ${idx + 1}`),
                            datasets: [{
                                label: 'Objective Value',
                                data: data.chart_data.convergence,
                                borderColor: colors[i % colors.length],
                                backgroundColor: colors[i % colors.length] + '22',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.4,
                                pointRadius: 3,
                                pointBackgroundColor: colors[i % colors.length]
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                                x: { grid: { display: false }, ticks: { color: '#888' } }
                            }
                        }
                    });
                }
                
                const resCtx = document.getElementById(`resChart-${algoId}`);
                if (resCtx && data.chart_data.performance) {
                    new Chart(resCtx, {
                        type: 'radar',
                        data: {
                            labels: ['Time \u23F1\uFE0F', 'Cost \uD83D\uDCB0', 'Reliability \u2705', 'Coverage \uD83C\uDFAF', 'Safety \uD83D\uDEE1\uFE0F'],
                            datasets: [{
                                label: 'Performance',
                                data: data.chart_data.performance,
                                backgroundColor: colors[i % colors.length] + '33',
                                borderColor: colors[i % colors.length],
                                pointBackgroundColor: colors[i % colors.length],
                                borderWidth: 2
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            scales: {
                                r: {
                                    angleLines: { color: 'rgba(255,255,255,0.1)' },
                                    grid: { color: 'rgba(255,255,255,0.1)' },
                                    pointLabels: { color: '#aaa', font: { size: 10 } },
                                    ticks: { display: false }
                                }
                            },
                            plugins: { legend: { display: false } }
                        }
                    });
                }
            }
            
            const planDiv = document.getElementById(`blueprint-${algoId}`);
            if (planDiv && (data.blueprint || data.candidates)) {
                renderBlueprintTable(data, planDiv);
            }
        }
    }

    // Render Global Radar Chart
    const ctxGlobal = document.getElementById('globalRadarChart');
    if (ctxGlobal && radarDatasets.length > 0) {
        globalRadarChart = new Chart(ctxGlobal, {
            type: 'radar',
            data: {
                labels: ['Time \u23F1\uFE0F', 'Cost \uD83D\uDCB0', 'Reliability \u2705', 'Coverage \uD83C\uDFAF', 'Safety \uD83D\uDEE1\uFE0F'],
                datasets: radarDatasets
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255,255,255,0.1)' },
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        pointLabels: { color: '#aaa', font: { size: 11 } },
                        ticks: { display: false }
                    }
                },
                plugins: { legend: { labels: { color: '#fff' } } }
            }
        });
    }
}

function renderBlueprintTable(data, container) {
    let tableHtml = `<table style="width:100%; border-collapse:collapse; margin-top:10px; color:#fff; background:rgba(255,255,255,0.02); border-radius:8px; overflow:hidden;">
        <thead>
            <tr style="background:rgba(167, 139, 250, 0.1); text-align:left;">
                <th style="padding:12px;">Zone/Unit</th>
                <th style="padding:12px;">Context</th>
                <th style="padding:12px;">Deployment</th>
            </tr>
        </thead>
        <tbody>`;
    
    const items = data.blueprint || data.candidates || [];
    items.forEach(item => {
        tableHtml += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding:10px; font-weight:700; color:#a78bfa;">${item.zone || item.unit_name || item.unit_id}</td>
            <td style="padding:10px;"><span style="background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:4px; font-size:0.75rem;">${item.severity || item.type}</span></td>
            <td style="padding:10px; font-family:monospace; color:#00ff88;">${item.allocation || (Math.round(item.eta_minutes) + 'm')}</td>
        </tr>`;
    });
    tableHtml += `</tbody></table>`;
    container.style.whiteSpace = 'normal';
    container.innerHTML = tableHtml;
}

function updateOptimizationMetrics(data, algo) {
    const mDist = document.getElementById('opt-metric-distance');
    const mTime = document.getElementById('opt-metric-time');
    const mCost = document.getElementById('opt-metric-cost');
    const mLoss = document.getElementById('opt-metric-losses');

    if (data.candidates) {
        // ... (existing metric calculation logic from runOptimizationEngine)
    } else if (data.assigned) {
        if (mCost) mCost.innerText = `${(data.total_cost/1000).toFixed(1)}k`;
        if (mTime) mTime.innerText = `~120s`; // IP constant estimation
        if (mLoss) mLoss.innerText = `0%`;
    }
}

window.runMultiOptimization = runMultiOptimization;
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await init();
        if (document.getElementById('water-table-content')) loadWaterSources();
        
        // Start Tactical Notification Polling
        if (document.getElementById('btn-notifications')) {
            setInterval(pollNotifications, 10000);
            pollNotifications();
        }
        
        console.log("System fully initialized");
    } catch (e) {
        console.error("Initialization Failed:", e);
    }
});

function exportTacticalPDF() {
    // We strictly target the Scientific Analysis Table as requested
    const table = document.getElementById('sci-comparison-table');
    
    if (!table || table.innerHTML.trim() === "") {
        if (typeof showToast === "function") {
            showToast("Analysis Required", "Please run the Scientific Benchmark first to generate the tactical table.", "warning");
        } else {
            alert("Please run Scientific Benchmark first.");
        }
        return;
    }
    
    // Switch to scientific view automatically so it's visible during print
    if (typeof setMode === "function") {
        setMode('scientific');
    }
    
    if (typeof showToast === "function") {
        showToast("Generating PDF", "Exporting Scientific Comparison Report...", "info");
    }

    setTimeout(() => {
        window.print();
    }, 500);
}

window.exportTacticalPDF = exportTacticalPDF;



async function saveMapChanges() {
    showToast("Synchronizing", "Broadcasting tactical changes to all units...", "info");
    
    try {
        await refreshData();
        
        const summary = `System synchronized: ${state.zones.length} Zones, ${state.waterSources.length} Water Sources, ${state.units.length} Stations active.`;
        showToast("Hifed Complete", summary, "success");
        
        if (typeof renderMapData === 'function') renderMapData();
        
        // If inventory modal is open, refresh it
        const invModal = document.getElementById('tactical-inventory-modal');
        if (invModal && !invModal.classList.contains('hidden')) {
            showTacticalInventory();
        }
    } catch (err) {
        showToast("Sync Error", "Failed to finalize changes: " + err.message, "error");
    }
}

async function showTacticalInventory() {
    const modal = document.getElementById('tactical-inventory-modal');
    const content = document.getElementById('inventory-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    content.innerHTML = '<div class="empty-state">Fetching tactical records...</div>';

    try {
        // Fetch fresh data
        const [zones, water, units] = await Promise.all([
            fetchJSON('/api/zones'),
            fetchJSON('/api/water'),
            fetchJSON('/api/units')
        ]);

        let html = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
                <!-- Water Sources Section -->
                <div class="dash-card" style="margin: 0; background: rgba(14, 165, 233, 0.05); border-color: rgba(14, 165, 233, 0.2); text-align: left;">
                    <h3 style="color: #0ea5e9; display: flex; align-items: center; gap: 10px; margin-top: 0;">💧 Water Sources (${water.length})</h3>
                    <div style="max-height: 250px; overflow-y: auto;">
                        ${water.length === 0 ? '<div style="color: #666; font-size: 0.9rem;">No water sources recorded</div>' : 
                          water.map(w => `
                            <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: 600; color: #fff;">${w.name}</div>
                                    <div style="font-size: 0.75rem; color: #aaa;">${w.capacity || 'Unknown Capacity'}</div>
                                </div>
                                <button class="btn-action-premium" onclick="centerMap(${w.lat}, ${w.lng}); document.getElementById('tactical-inventory-modal').classList.add('hidden')" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(14, 165, 233, 0.1);">Map</button>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Tactical Zones Section -->
                <div class="dash-card" style="margin: 0; background: rgba(34, 197, 94, 0.05); border-color: rgba(34, 197, 94, 0.2); text-align: left;">
                    <h3 style="color: #22c55e; display: flex; align-items: center; gap: 10px; margin-top: 0;">🌳 Tactical Zones (${zones.length})</h3>
                    <div style="max-height: 250px; overflow-y: auto;">
                        ${zones.length === 0 ? '<div style="color: #666; font-size: 0.9rem;">No zones recorded</div>' : 
                          zones.map(z => `
                            <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: 600; color: #fff;">${z.name}</div>
                                    <div style="font-size: 0.75rem; color: #aaa;">${z.hazard_type} | ${z.risk_level}</div>
                                </div>
                                <button class="btn-action-premium" onclick="centerMap(${z.center_lat}, ${z.center_lng}); document.getElementById('tactical-inventory-modal').classList.add('hidden')" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(34, 197, 94, 0.1);">Map</button>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Fire Stations Section -->
                <div class="dash-card" style="margin: 0; background: rgba(249, 115, 22, 0.05); border-color: rgba(249, 115, 22, 0.2); text-align: left;">
                    <h3 style="color: #f97316; display: flex; align-items: center; gap: 10px; margin-top: 0;">🏗️ Fire Stations (${units.length})</h3>
                    <div style="max-height: 250px; overflow-y: auto;">
                        ${units.length === 0 ? '<div style="color: #666; font-size: 0.9rem;">No stations recorded</div>' : 
                          units.map(u => `
                            <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: 600; color: #fff;">${u.name}</div>
                                    <div style="font-size: 0.75rem; color: #aaa;">Status: ${u.status || 'Active'}</div>
                                </div>
                                <button class="btn-action-premium" onclick="centerMap(${u.lat}, ${u.lng}); document.getElementById('tactical-inventory-modal').classList.add('hidden')" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(249, 115, 22, 0.1);">Map</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <div style="margin-top: 30px; padding: 20px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); text-align: left;">
                <h4 style="margin: 0 0 10px 0; color: #aaa; font-size: 0.85rem; letter-spacing: 1px;">📊 DATA SUMMARY</h4>
                <div style="display: flex; gap: 40px; align-items: center;">
                    <div><span style="color: #0ea5e9; font-weight: 900; font-size: 1.4rem;">${water.length}</span> <span style="font-size: 0.8rem; color: #888; font-weight: 600;">WATER POINTS</span></div>
                    <div style="width: 1px; height: 30px; background: rgba(255,255,255,0.1);"></div>
                    <div><span style="color: #22c55e; font-weight: 900; font-size: 1.4rem;">${zones.length}</span> <span style="font-size: 0.8rem; color: #888; font-weight: 600;">ACTIVE ZONES</span></div>
                    <div style="width: 1px; height: 30px; background: rgba(255,255,255,0.1);"></div>
                    <div><span style="color: #f97316; font-weight: 900; font-size: 1.4rem;">${units.length}</span> <span style="font-size: 0.8rem; color: #888; font-weight: 600;">DEPLOYABLE UNITS</span></div>
                </div>
            </div>
        `;
        content.innerHTML = html;
    } catch (err) {
        content.innerHTML = `<div class="error-text">Failed to load inventory: ${err.message}</div>`;
    }
}

window.saveMapChanges = saveMapChanges;
window.showTacticalInventory = showTacticalInventory;

function updateTacticalEstimation() {
    const zoneType = document.getElementById('input-zone')?.value;
    const panel = document.getElementById('rif-prediction-panel');
    const estDisplay = document.getElementById('tactical-casualty-est');
    const reasonDisplay = document.getElementById('tactical-risk-reason');
    
    if (!panel) return;

    if (zoneType === 'Wildland') {
        panel.style.display = 'block';
        
        // Tactical Heuristic: Rural fires impact varies by wind and area
        // Get current wind from pill if available
        const windText = document.getElementById('pill-wind')?.textContent || '0';
        const windSpeed = parseFloat(windText.replace(/[^\d.]/g, '')) || 5;
        
        // Base estimate for rural/forest areas
        let baseRisk = Math.round(windSpeed * 1.5 + 2); 
        
        estDisplay.textContent = `~ ${baseRisk} People potentially affected`;
        reasonDisplay.textContent = `Estimation for "RIIF": Calculated based on wind speed (${windSpeed}km/h) and forest density.`;
        
        // Also update the main affected input automatically if it's 0
        const affectedInput = document.getElementById('input-affected');
        if (affectedInput && (affectedInput.value === '0' || affectedInput.value === '')) {
            affectedInput.value = baseRisk;
        }
    } else {
        panel.style.display = 'none';
    }
}

// Ensure it's globally accessible
window.updateTacticalEstimation = updateTacticalEstimation;

function refreshWeather() {
    showToast("Weather Update", "Fetching live meteorological data...", "info");
    if (state.lastClickedLocation) {
        fetchAndDisplayWeather(state.lastClickedLocation.lat, state.lastClickedLocation.lng);
    } else {
        // Default to system center
        fetchAndDisplayWeather(36.1653, 1.3345);
    }
}
window.refreshWeather = refreshWeather;
