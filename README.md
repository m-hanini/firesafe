# FireSafe: An Interactive Decision-Support System for Real-Time Firefighting Resource Allocation

> **Demo paper** — submitted to [Conference Name]

FireSafe is a web-based Decision Support System (DSS) that integrates bio-inspired and mathematical optimization algorithms to solve the **Multi-Objective Fire Resource Allocation Problem (MO-FRAP)** in real time. The system is demonstrated on the Chlef wilaya of Algeria, covering 26 official Protection Civile units across the region.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Optimization Algorithms](#optimization-algorithms)
- [Escalation Model](#escalation-model)
- [User Roles & Portals](#user-roles--portals)
- [Tech Stack](#tech-stack)
- [Setup & Installation](#setup--installation)
- [Demo Credentials](#demo-credentials)
- [Project Structure](#project-structure)
- [Citation](#citation)

---

## Overview

Wildfire response in Algeria's northern wilayas demands rapid, coordinated dispatch decisions across heterogeneous terrain and scarce resources. FireSafe addresses this challenge by:

- **Automatically evaluating fire severity** based on burned area, temperature, wind speed, and active incident count.
- **Selecting and dispatching** the optimal subset of firefighting equipment from the nearest available units using a suite of metaheuristic and exact algorithms.
- **Modeling domino spread risk** — the probability that a fire in one zone triggers ignition in an adjacent zone — and incorporating it into the dispatch objective.
- **Providing role-differentiated interfaces** for administrators, field firemen, and citizens, each tailored to their operational context.

---

## System Architecture

```
┌────────────────────────────────────────────────────────────┐
│                        FireSafe DSS                        │
│                                                            │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────┐  │
│  │  Citizen     │   │  Fireman     │   │  Admin        │  │
│  │  Portal      │   │  Tactical    │   │  Command      │  │
│  │  (SOS report)│   │  Dashboard   │   │  Center       │  │
│  └──────┬───────┘   └──────┬───────┘   └──────┬────────┘  │
│         └──────────────────┼──────────────────┘           │
│                            │                               │
│              ┌─────────────▼──────────────┐               │
│              │      Flask REST API         │               │
│              │   Alert · Dispatch · Zones  │               │
│              └─────────────┬──────────────┘               │
│                            │                               │
│         ┌──────────────────┼──────────────────┐           │
│         │                  │                  │            │
│  ┌──────▼──────┐  ┌────────▼──────┐  ┌───────▼──────┐    │
│  │  Escalation │  │ Optimization  │  │  GIS / Map   │    │
│  │  Engine     │  │ Algorithm     │  │  Engine      │    │
│  │  (N1/N2/N3) │  │ Suite         │  │  (Leaflet.js)│    │
│  └─────────────┘  └───────────────┘  └──────────────┘    │
│                            │                               │
│              ┌─────────────▼──────────────┐               │
│              │         PostgreSQL           │               │
│              │  Units · Zones · Alerts ·   │               │
│              │  Dispatches · Equipment      │               │
│              └────────────────────────────┘               │
└────────────────────────────────────────────────────────────┘
```

**Data flow for a new incident:**  
Citizen/Fireman submits alert → Escalation engine scores the fire → Optimization algorithm selects optimal equipment → Dispatch records are committed → Fireman dashboard and map update in real time.

---

## Optimization Algorithms

FireSafe solves MO-FRAP as a bi-objective problem: **minimise response cost** and **minimise fire damage**. Four algorithm families are available and can be switched at dispatch time.

### 1. Grey Wolf Optimizer (GWO) / Hybrid PSO-GWO

The primary dispatch engine. Simulates the social leadership hierarchy of grey wolves (Alpha, Beta, Delta, Omega) to guide the swarm toward Pareto-optimal resource allocations.

- **GWO** (`algorithms/gwo_optimizer.py`): Continuous-space position vectors are mapped to discrete unit assignments via a proportional rounding scheme. The Alpha wolf's position yields the final dispatch plan.
- **Hybrid PSO-GWO** (inline in `app.py`): PSO's velocity-based global exploration is combined with GWO's leader-guided local exploitation. Particularly effective for large-scale, high-escalation incidents.

Key parameters: population size = `max(12, required_count × 6)`, iterations = 25, boundary-clamped position updates.

### 2. Genetic Algorithm / NSGA-II

Evolutionary approach encoding dispatch plans as integer chromosomes (indices into the candidate equipment pool).

- **GA**: Single-objective fitness function combining travel cost, domino damage score, and zone-hazard multipliers. Uses elite selection (top 25%), single-point crossover, and random mutation (rate = 0.25).
- **NSGA-II** (`algorithm="nsga"`): Non-dominated sorting extension that explicitly maintains the trade-off front between cost and damage.

Generations = 22, population = `max(12, required_count × 6)`.

### 3. Goal Programming (GP)

Multi-objective model that minimises weighted deviations from pre-set tactical targets (e.g., max ETA ≤ 15 min, damage score ≤ threshold). Used for structured, policy-constrained scenarios.

### 4. Integer Programming (IP)

Deterministic exact solver for binary allocation decisions (deploy unit X to zone Y: yes/no). Provides a reproducible baseline and is used for low-complexity, single-zone incidents.

### Fitness Function

All evolutionary algorithms share the same fitness landscape:

```
fitness = Σ (distance_km × 5 × risk_multiplier + eta_min × 2 − priority_bonus + zone_penalty)
        + risk_multiplier × uncontained_area_ha × 50 × (1 + neighbors × 0.5)
```

Zone hazard type doubles the risk multiplier; industrial zones bonus foam units; wildland zones bonus water-tankers.

---

## Escalation Model

FireSafe classifies every active fire into one of three escalation levels based on a composite **Fire Intensity Index (0–100)**:

| Level | Name | Burned Area | Temp | Wind | Index | Dispatch Scope |
|-------|------|-------------|------|------|-------|----------------|
| N1 | Local | < 1 ha | < 400 °C | < 20 km/h | < 35 | Exact zone only |
| N2 | Sector | 1–5 ha | 400–600 °C | 20–40 km/h | 35–60 | Same-color zone group |
| N3 | Regional | > 5 ha | > 600 °C | > 40 km/h | ≥ 60 | Adjacent zones + wilaya-wide |

The escalation level also scales the number of dispatched units (N1 ×1.0, N2 ×1.5, N3 ×2.5 of the base severity requirement).

**Domino Risk** is computed separately: nearby open alerts within 12 km are scored by severity and proximity; a cumulative score ≥ 10 flags a `high` domino risk that penalises uncontained area further in the fitness function.

---

## User Roles & Portals

| Role | Access | Key Features |
|------|--------|--------------|
| **Admin** | `/admin` | Full tactical map · Asset management · Algorithm benchmark · Incident analytics · User management |
| **Fireman** | `/fireman` | Field incident reporting with GPS · Weather telemetry pill · Live dispatch status · Unit response page |
| **Citizen** | `/report` | Simplified SOS submission · Location pin · Incident status tracking |

Authentication is provided via **Google OAuth 2.0** (citizens) and a dedicated **Fireman Portal** with email-based role lookup.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.x · Flask 3.1 |
| Database | PostgreSQL (psycopg2 / pg8000 with connection pooling) |
| Mapping | Leaflet.js · OpenStreetMap |
| Charts | Chart.js |
| Auth | Authlib · Google OAuth 2.0 |
| Weather | Open-Meteo API (free, no key required) |
| Deployment | Gunicorn · Vercel / any WSGI host |
| Frontend | Vanilla CSS3 (Glassmorphism) · ES6+ JavaScript |

---

## Setup & Installation

### Prerequisites

- Python 3.10+
- PostgreSQL 14+
- A Google OAuth 2.0 client (for citizen login) — optional for demo

### 1. Clone

```bash
git clone https://github.com/m-hanini/firesafe.git
cd firesafe
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

Copy the template and fill in your values:

```bash
cp .env.example .env
```

```env
FLASK_SECRET_KEY=your_secret_key_here
DATABASE_URL=postgresql://postgres:password@localhost/firesafe_db
GOOGLE_CLIENT_ID=your_google_client_id       # optional
GOOGLE_CLIENT_SECRET=your_google_client_secret  # optional
```

### 4. Initialise the database

The schema and seed data are created automatically on first run:

```bash
python app.py
```

The app calls `init_db()` and `seed_data()` on startup, creating all tables and populating the 26 Protection Civile units of Chlef.

### 5. Open the app

Navigate to `http://localhost:5000` in your browser.

---

## Demo Credentials

For a quick offline demo (no Google OAuth required):

| Role | Email | Portal |
|------|-------|--------|
| Admin | `admin@firesafe.dz` | `/login` → Admin |
| Fireman | `any@firesafe.dz` | `/login/fireman` |
| Citizen | Google account | `/login` → Google |

---

## Project Structure

```
firesafe/
├── app.py                    # Flask application, routes, dispatch logic
├── weather_service.py        # Open-Meteo weather integration
├── algorithms/
│   └── gwo_optimizer.py      # GWO optimizer + FirefightingEvaluator
├── templates/
│   ├── admin_dashboard.html  # Admin command center
│   ├── fireman_tactical.html # Fireman field dashboard
│   ├── client.html           # Citizen SOS portal
│   ├── landing.html          # Public landing page
│   └── ...                   # Supporting templates
├── static/
│   ├── css/style.css         # Glassmorphism design system
│   └── js/
│       ├── script.js         # Core map & dispatch interactions
│       ├── algorithm-optimizer.js
│       ├── ui-enhancements.js
│       └── form-validator.js
├── requirements.txt
├── Procfile                  # Gunicorn entry point
└── vercel.json               # Vercel deployment config
```

---

## License

This project is released for academic demonstration purposes alongside the above paper submission.

---

## Screenshots

See the consolidated screenshots and short descriptions in the project docs: [docs/screenshots.md](docs/screenshots.md)
