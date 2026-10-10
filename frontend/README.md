# AgriSure — Frontend Single Page Application (SPA)

This directory contains the standalone frontend application for **AgriSure — Climate-Aware Credit Risk Assessment System**.

## 📁 Directory Structure

```
frontend/
├── index.html                  # Main SPA Single Page Application template & layout
├── 404.html                    # Static server History API fallback handler
├── css/
│   └── styles.css              # Custom Vanilla CSS Design System tokens & styles
├── js/
│   ├── app.js                  # History API Clean Path Router & Core Navigation
│   ├── auth_controller.js      # JWT Authentication, Google OAuth, & Profile UI
│   ├── climate_controller.js   # Open-Meteo & SoilGrids Telemetry Controller
│   ├── crop_insights_controller.js # Dataset Explorer & Agronomic Insights
│   ├── officer_controller.js   # Bank Officer Desk & Audit Trail Logging
│   └── risk_controller.js      # Climate Risk Engine & SHAP Explainability UI
├── data/
│   └── catalog.json            # Static Kaggle dataset catalog fallback
├── serve.py                    # Standalone SPA Dev Server (Port 8080)
└── package.json                # Frontend scripts configuration
```

## 🚀 Running the Frontend Locally

```bash
# Option 1: Using Python
python serve.py 8080

# Option 2: Using NPM (if node installed)
npm run dev
```

Open `http://localhost:8080` or `http://localhost:8080/login` in your browser.

## 🔗 Backend API Integration

The frontend automatically connects to the backend API (`/api/v2/...`):
- **Production / Vercel**: Uses relative paths (`/api/v2/...`).
- **Local Dev Server**: Connects seamlessly to `http://localhost:8000` or `http://localhost:8080`.
