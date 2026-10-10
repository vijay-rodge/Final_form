# AgriSure — Climate-Aware Credit Risk Assessment System

> **Institutional Climate Intelligence & Agricultural Credit Underwriting Platform**  
> Aligned with AgriSure & Indian Agricultural Lending Frameworks (Kisan Credit Card / KCC)

---

## 🌾 Overview

**AgriSure** is an institutional web platform and decision-support system designed to bridge agricultural finance with real-time climate and agronomic intelligence. Traditional agricultural lending predominantly relies on static historical land records and generic credit scores (CIBIL), often ignoring dynamic climate risks such as droughts, heatwaves, soil degradation, and delayed monsoons.

AgriSure introduces a **Dual-Pillar Credit Risk Engine (FIN-03)** that combines:
1. **Financial Creditworthiness**: Land ownership, crop economics, debt-to-income (DTI), CIBIL credit scores, and historical repayment behaviour.
2. **Climate & Agronomic Telemetry**: Live weather observations, heatwave & rainfall anomaly forecasts, satellite NDVI vegetation indices, and ISRIC SoilGrids soil quality profiles.

---

## 📋 Core Modules & Application Routes

The platform is built as a responsive Single Page Application (SPA) with client-side hash routing:

| Route | Module | Key Features & Capabilities |
| :--- | :--- | :--- |
| `#/dashboard` | **Executive Dashboard** | Portfolio-level risk metrics, district-level climate exposure summaries, approval ratios, and dynamic KPI distribution charts. |
| `#/loans` | **Loan Records & Application** | Official KCC application workflow, 100-farmer synthetic portfolio tracker, and interactive Leaflet map for GPS agricultural field boundary selection. |
| `#/crops` | **Agricultural Datasets** | Ingested Indian agricultural production, Minimum Support Price (MSP), yield trends, and district-level agronomic catalog. |
| `#/climate` | **Environmental Telemetry** | Real-time weather via Open-Meteo API, NASA Landsat / Copernicus Sentinel-2 30m NDVI vegetation health, and ISRIC SoilGrids v2.0 REST telemetry. |
| `#/risk` | **Risk Assessment Engine** | FIN-03 Dual-Pillar scoring (300–900 scale), XGBoost yield forecasting, SHAP explainable AI risk attributions, and climate stress testing. |
| `#/officer` | **Bank Officer Portal** | Role-gated underwriter workstation: review queues, telemetry audit inspections, loan approval/rejection decisions, and institutional PDF report generation. |
| `#/auth` | **Authentication & RBAC** | Role-Based Access Control for Farmers and Credit Officers, password authentication, and Google OAuth 2.0 Single Sign-On (SSO). |

---

## 🛡️ Dual-Pillar Risk Engine (FIN-03)

AgriSure's credit risk evaluation is calculated using an auditable dual-pillar architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                 AgriSure Credit Score (300 - 900)           │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│     Pillar 1: Financial (60%) │   │     Pillar 2: Climate (40%)   │
├───────────────────────────────┤   ├───────────────────────────────┤
│ • Farmer CIBIL Credit Score   │   │ • 30-Day Rainfall Deficit     │
│ • Land Holding Size (Acres)   │   │ • Heatwave Extreme Heat Days  │
│ • Crop Economic Margin / MSP  │   │ • Landsat / Sentinel-2 NDVI   │
│ • Debt-to-Income (DTI) Ratio  │   │ • SoilGrids (pH, Clay, Carbon)│
│ • Prior Repayment Track       │   │ • Historical Drought Index    │
└───────────────────────────────┘   └───────────────────────────────┘
```

- **Scoring Scale**: 300 to 900 (analogous to credit bureau scores).
- **Automated Underwriting Decisions**:
  - `Approved`: Low risk profile, eligible for standard interest subvention.
  - `Conditional Approval`: Moderate risk; requires mandatory PM Fasal Bima Yojana crop insurance top-up or drip irrigation implementation.
  - `High Risk / Under Review`: Severe drought exposure, negative soil properties, or financial distress; escalated for manual officer inspection.
- **Explainable AI (SHAP)**: Identifies top risk contributors (e.g., rainfall anomaly -18%, NDVI below 0.35, high debt burden) to ensure transparency for both lenders and farmers.

---

## 🛠️ Technology Stack

### Frontend
- **Core**: Vanilla HTML5, modern CSS3, ES6+ JavaScript modules.
- **Design System**: AgriSure Institutional Theme (Deep Teal `#0d9488`, Aqua Cyan `#06b6d4`, Slate `#0f172a`, clean white cards).
- **Mapping**: Leaflet.js with interactive GPS polygon capture for agricultural parcels.
- **Visualization**: Chart.js for telemetry time-series and risk distribution graphs.
- **Icons**: Lucide Icons.

### Backend & Analytics
- **API Framework**: FastAPI (Python 3.10+) with Uvicorn ASGI server.
- **Telemetry Integrations**:
  - **Open-Meteo API**: Precipitation, temperature extremes, historical weather.
  - **NASA / USGS Landsat-8 & 9 / Copernicus CDSE**: 30m surface reflectance & NDVI vegetation indices.
  - **ISRIC SoilGrids REST API v2.0**: pH, clay fraction, organic carbon, sand percentage.
- **Report Generation**: ReportLab PDF generator for institutional credit risk dossiers.
- **Authentication**: JWT token authorization and Google OAuth 2.0 flow with server-side bank officer email allowlisting.

---

## 📁 Repository Structure

```
final_form/
├── index.html                  # Main SPA entry point & UI views
├── .env                        # Active environment configuration
├── .env.example                # Template configuration with setup instructions
├── css/
│   └── styles.css              # AgriSure institutional design system
├── js/
│   ├── app.js                  # Main SPA router & navigation controller
│   ├── auth_controller.js      # Session management, Google OAuth & RBAC
│   ├── climate_controller.js   # Open-Meteo, Landsat & SoilGrids telemetry UI
│   ├── crop_insights_controller.js # Agricultural data analytics & MSP charts
│   ├── data.js                 # District presets & agronomic model constants
│   ├── explainability.js       # SHAP risk driver attribution engine
│   ├── map_field_selector.js   # Leaflet GPS farm polygon capture tool
│   ├── officer_controller.js   # Credit officer review queue & underwriting
│   ├── risk_controller.js      # Dual-pillar risk scoring UI controller
│   ├── risk_engine.js          # Client-side dynamic risk calculation engine
│   ├── satellite_api.js        # Satellite & NDVI data retrieval connector
│   └── yield_model.js          # Crop yield forecasting engine
├── data/
│   ├── synthetic_agricultural_loan_repayment_100_farmers.csv  # Synthetic loan portfolio
│   ├── catalog.json            # Ingested agricultural datasets catalog
│   ├── DATA_CATALOG.md         # Documentation of agricultural datasets
│   ├── audit_log.json          # System event audit records
│   ├── lending_decisions.json  # Recorded underwriter decisions
│   └── users.json              # Local user authentication store
├── backend/
│   ├── main.py                 # FastAPI backend server & static file host
│   ├── auth_service.py         # JWT & Google OAuth 2.0 authentication service
│   ├── officer_service.py      # Bank officer review queue & decisions API
│   ├── risk_service.py         # Backend risk calculation & scoring API
│   ├── farmer_data_service.py  # Farmer loan application submission API
│   ├── crop_data_service.py    # Agricultural datasets query API
│   ├── analytics/
│   │   ├── risk_engine.py      # Server-side FIN-03 risk engine
│   │   ├── shap_explainability.py # Server-side SHAP attribution engine
│   │   ├── yield_predictor.py  # XGBoost crop yield predictor
│   │   └── pdf_generator.py    # ReportLab institutional PDF report generator
│   └── integrations/
│       ├── openmeteo_service.py # Open-Meteo weather client
│       ├── landsat_service.py   # NASA Landsat telemetry client
│       ├── soilgrids_service.py # ISRIC SoilGrids REST client
│       └── copernicus_service.py# Copernicus Sentinel connector
└── README.md                   # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.10+**
- Standard web browser (Chrome, Edge, Firefox)

### 1. Configure Environment Variables
Copy `.env.example` to `.env` in the project root:
```bash
cp .env.example .env
```
Key settings in `.env`:
```ini
# Google OAuth 2.0 Credentials (Optional for local testing)
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v2/auth/google/callback

# Session Security & Application Base URL
SESSION_SECRET_KEY=agri_credit_risk_session_secret_2026_prod
APP_BASE_URL=http://localhost:8000

# Bank Officer Google Allowlist (grant officer privileges to specific emails)
GOOGLE_OFFICER_EMAILS=officer1@bank.org,officer2@bank.org,credit.officer@agrisure.in
```

### 2. Launch the Application

#### Option A: FastAPI Backend Server (Recommended — Full Capabilities)
Running the FastAPI server enables live telemetry APIs, PDF generation, and Google OAuth:
```bash
# From the project root
python backend/main.py
```
The application will be live at:  
👉 **[http://localhost:8000](http://localhost:8000)**

#### Option B: Standalone Static Frontend
To preview the frontend UI without starting the Python backend:
```bash
python -m http.server 8080
```
Then navigate to `http://localhost:8080`.

---

## 🔐 Default Demo Accounts

For demonstration and testing purposes, predefined accounts are available:

| Role | Username / Email | Password | Access Privileges |
| :--- | :--- | :--- | :--- |
| **Farmer** | `farmer@agrisure.in` | `FarmerPass123!` | Loan application, field mapping, view personal credit assessment |
| **Bank Officer** | `credit.officer@agrisure.in` | `OfficerPass123!` | Underwriting queue, officer portal, approve/reject loans, generate PDF reports |

*(New accounts can also be created directly via the Registration screen or Google Sign-In).*

---

## 📊 Synthetic Data & Institutional Disclaimer

The reference dataset `data/synthetic_agricultural_loan_repayment_100_farmers.csv` and sample applications:
- Contain strictly **synthetic demonstration data** generated for testing, algorithmic verification, and user interface demonstration.
- Do **NOT** contain real farmer identities, live bank account balances, or actual financial records from AgriSure or partner banks.
- Must not be interpreted as actual financial advice or live credit bureau determinations.
