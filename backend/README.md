# AgriSure — Backend API Microservice

This directory contains the Python FastAPI backend microservice for **AgriSure — Climate-Aware Credit Risk Assessment System**.

## 📁 Directory Structure

```
backend/
├── main.py                     # FastAPI Application Entrypoint & CORS configuration
├── auth_service.py             # JWT Token Auth, Google OAuth, Allowlist & Roles
├── officer_service.py          # Bank Officer Review Queue, Approvals & Decisions
├── risk_service.py             # Climate Credit Risk Engine & SHAP Explainability
├── farmer_data_service.py      # Farmer Profiles & KCC Loan Application Prefill
├── crop_data_service.py        # Kaggle Agronomic Ingestion & Data Pagination
├── analytics/                  # Predictive engines (XGBoost, SHAP, PDF Generator)
├── integrations/               # Telemetry connectors (Open-Meteo, Sentinel, SoilGrids)
├── data/                       # Application JSON databases (users, applications, decisions)
└── requirements.txt            # Python dependencies specification
```

## 🚀 Running the Backend Server Locally

```bash
# 1. Install Dependencies
pip install -r requirements.txt

# 2. Start the Backend API Server
python main.py
```

The backend server runs on `http://localhost:8000` with interactive Swagger API docs at `http://localhost:8000/docs`.
