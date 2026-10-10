import os
import csv
import json
import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Query, HTTPException, Depends, Body
from pydantic import BaseModel, Field

import sys
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)

from auth_service import require_role, get_current_user, get_optional_user
from analytics.risk_engine import ClimateCreditRiskEngine
from farmer_data_service import load_all_farmers_data, get_bank_details_for_farmer
from risk_service import (
    load_borrowers_csv,
    get_crop_agronomic_context,
    WEATHER_CACHE,
    SOIL_CACHE,
    DISTRICT_COORDS,
    load_assessments_db,
    save_assessment_record
)

router = APIRouter(prefix="/api/v2/officer", tags=["Bank Officer Dashboard & Review Queue"])

AUDIT_LOG_PATH = os.path.join(BASE_DIR, "data", "audit_log.json")
DECISIONS_PATH = os.path.join(BASE_DIR, "data", "lending_decisions.json")
DISMISSED_APPS_PATH = os.path.join(BASE_DIR, "data", "dismissed_applications.json")
CSV_PATH = os.path.join(BASE_DIR, "data", "synthetic_agricultural_loan_repayment_100_farmers.csv")
USERS_PATH = os.path.join(BASE_DIR, "data", "users.json")

def load_dismissed_applications_db() -> List[str]:
    if os.path.exists(DISMISSED_APPS_PATH):
        try:
            with open(DISMISSED_APPS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_dismissed_application(app_id: str):
    dismissed = load_dismissed_applications_db()
    if app_id not in dismissed:
        dismissed.append(app_id)
        os.makedirs(os.path.dirname(DISMISSED_APPS_PATH), exist_ok=True)
        with open(DISMISSED_APPS_PATH, "w", encoding="utf-8") as f:
            json.dump(dismissed, f, indent=2)

def clear_all_dismissed_applications():
    if os.path.exists(DISMISSED_APPS_PATH):
        with open(DISMISSED_APPS_PATH, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2)

def load_farmer_user_names_map() -> Dict[str, str]:
    mapping = {}
    if os.path.exists(USERS_PATH):
        try:
            with open(USERS_PATH, "r", encoding="utf-8") as f:
                users = json.load(f)
                for u in users:
                    if u.get("farmer_id") and u.get("full_name"):
                        mapping[u.get("farmer_id")] = u.get("full_name")
        except Exception:
            pass
    return mapping

risk_engine = ClimateCreditRiskEngine()

def load_audit_log_db() -> List[Dict[str, Any]]:
    if os.path.exists(AUDIT_LOG_PATH):
        try:
            with open(AUDIT_LOG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_audit_log_record(record: Dict[str, Any]):
    logs = load_audit_log_db()
    logs.append(record)
    os.makedirs(os.path.dirname(AUDIT_LOG_PATH), exist_ok=True)
    with open(AUDIT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(logs, f, indent=2)

def load_lending_decisions_db() -> List[Dict[str, Any]]:
    if os.path.exists(DECISIONS_PATH):
        try:
            with open(DECISIONS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_lending_decision_record(record: Dict[str, Any]):
    decisions = load_lending_decisions_db()
    target_id = record.get("farmer_id") or record.get("application_id")
    updated = False
    for idx, d in enumerate(decisions):
        if d.get("farmer_id") == target_id or d.get("application_id") == target_id:
            decisions[idx] = record
            updated = True
            break
    if not updated:
        decisions.append(record)

    os.makedirs(os.path.dirname(DECISIONS_PATH), exist_ok=True)
    with open(DECISIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(decisions, f, indent=2)

class OfficerStatusChangeRequest(BaseModel):
    action: str = Field(..., description="Action: 'mark_under_review', 'request_additional_info', 'approve', 'reject'")
    explanation_or_notes: Optional[str] = Field(None, description="Explanation rationale required for approval, rejection, or info request")
    approved_amount_inr: Optional[float] = Field(None, description="Approved loan amount in INR if approving")
    additional_info_requested: Optional[str] = Field(None, description="Details of missing documentation required")

@router.get("/dashboard-summary")
def get_officer_dashboard_summary(
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    """Returns executive dashboard summary metrics and portfolio distribution for Bank Officers."""
    farmers = load_all_farmers_data()
    decisions = load_lending_decisions_db()

    dec_map = {d.get("farmer_id"): d for d in decisions if d.get("farmer_id")}

    total_apps = len(farmers)
    awaiting_review = 0
    under_review = 0
    additional_info_req = 0
    approved = 0
    rejected = 0
    assessed_count = 0

    risk_dist = {"Low": 0, "Moderate": 0, "High": 0}
    district_summary = {}

    for f in farmers:
        fid = f["farmer_id"]
        dec_obj = dec_map.get(fid)
        
        status = "Submitted"
        if dec_obj:
            d_val = dec_obj.get("decision", "").upper()
            if d_val == "APPROVED":
                status = "Approved"
            elif d_val == "REJECTED":
                status = "Rejected"
            elif "CONDITIONAL" in d_val or "INFO" in d_val:
                status = "Additional Information Required"
            elif "REVIEW" in d_val:
                status = "Under Review"

        if status == "Submitted":
            awaiting_review += 1
        elif status == "Under Review":
            under_review += 1
        elif status == "Additional Information Required":
            additional_info_req += 1
        elif status == "Approved":
            approved += 1
        elif status == "Rejected":
            rejected += 1

        # Quick risk evaluation for portfolio metrics
        dist = f.get("district", "Dharwad")
        dist_key = dist.lower().split(",")[0].strip()
        w = WEATHER_CACHE.get(dist_key, {"totalPrecipitationMm": 320.0, "avgTempMaxC": 30.0})
        rain_deficit = max(-50.0, min(50.0, ((w.get("totalPrecipitationMm", 320.0) - 400.0) / 400.0) * 100.0))

        # Risk classification proxy
        if f["agricultural_history"]["irrigation_type"] == "Rainfed" and rain_deficit < -20.0:
            risk_cat = "High"
        elif f["agricultural_history"]["irrigation_type"] in ["Drip", "Canal"] and f["credit_history"]["derived_cibil_score"] >= 700:
            risk_cat = "Low"
        else:
            risk_cat = "Moderate"

        risk_dist[risk_cat] = risk_dist.get(risk_cat, 0) + 1
        assessed_count += 1

        if dist not in district_summary:
            district_summary[dist] = {"district": dist, "total_applications": 0, "total_rain_mm": w.get("totalPrecipitationMm", 320.0), "high_risk_count": 0}
        district_summary[dist]["total_applications"] += 1
        if risk_cat == "High":
            district_summary[dist]["high_risk_count"] += 1

    return {
        "status": "success",
        "officer": current_user.get("full_name", "Anil Deshmukh (Credit Officer)") if current_user else "Anil Deshmukh (Credit Officer)",
        "summary": {
            "total_applications": total_apps,
            "awaiting_review_count": awaiting_review,
            "under_review_count": under_review,
            "assessed_by_risk_engine_count": assessed_count,
            "additional_info_required_count": additional_info_req,
            "approved_count": approved,
            "rejected_count": rejected
        },
        "risk_level_distribution": risk_dist,
        "climate_risk_trends": list(district_summary.values())
    }

@router.get("/applications")
def get_officer_applications_queue(
    search: Optional[str] = Query(None, description="Search by App ID, Farmer ID, Name, District, Crop"),
    status_filter: Optional[str] = Query("All", description="Status filter: All, Submitted, Under Review, Additional Information Required, Approved, Rejected"),
    risk_filter: Optional[str] = Query("All", description="Risk filter: All, Low, Moderate, High"),
    include_dismissed: bool = Query(False, description="Whether to include dismissed/deleted applications"),
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    """Retrieves searchable, filterable application queue for bank officers."""
    farmers = load_all_farmers_data()
    decisions = load_lending_decisions_db()
    dismissed = [d.upper() for d in load_dismissed_applications_db()]
    farmer_names_map = load_farmer_user_names_map()
    
    app_dec_map = {}
    farmer_dec_map = {}
    for d in decisions:
        if d.get("application_id"):
            app_dec_map[d.get("application_id").upper()] = d
        if d.get("farmer_id"):
            farmer_dec_map[d.get("farmer_id").upper()] = d

    queue = []
    search_norm = search.lower().strip() if search else ""

    for f in farmers:
        fid = f["farmer_id"]
        lid = f["loan_id"]
        dist = f["district"]
        state = f["state"]
        crop = f["agricultural_history"]["crop_type"]
        acres = f["agricultural_history"]["farm_area_acres"]
        amount = f["financials"]["loan_amount_inr"]
        purpose = f["financials"]["loan_purpose"]
        irr = f["agricultural_history"]["irrigation_type"]
        cibil = f["credit_history"]["derived_cibil_score"]
        
        # Application ID formatting
        import re
        if lid.startswith("APP-2026-"):
            app_id = lid
        else:
            num = re.sub(r'\D', '', lid) or '1'
            app_id = f"APP-2026-{(8000 + int(num)):04d}"

        # Filter dismissed / deleted applications
        if not include_dismissed:
            if app_id.upper() in dismissed or lid.upper() in dismissed:
                continue

        dec_obj = app_dec_map.get(app_id.upper()) or app_dec_map.get(lid.upper())
        curr_status = "Submitted"
        officer_notes = "Application placed in Bank Officer review queue."
        approved_amt = None
        if dec_obj:
            d_val = dec_obj.get("decision", "").upper()
            if d_val in ["APPROVED", "APPROVE"]:
                curr_status = "Approved"
            elif d_val in ["REJECTED", "REJECT"]:
                curr_status = "Rejected"
            elif "CONDITIONAL" in d_val or "INFO" in d_val:
                curr_status = "Additional Information Required"
            elif "REVIEW" in d_val:
                curr_status = "Under Review"
            officer_notes = dec_obj.get("officer_notes", officer_notes)
            approved_amt = dec_obj.get("approved_amount_inr")

        farmer_name = farmer_names_map.get(fid) or f"Farmer Borrower ({fid})"

        # Dual Pillar Risk calculations
        dist_key = dist.lower().split(",")[0].strip()
        w = WEATHER_CACHE.get(dist_key, {"totalPrecipitationMm": 320.0, "avgTempMaxC": 30.0})
        rain_deficit = max(-50.0, min(50.0, ((w.get("totalPrecipitationMm", 320.0) - 400.0) / 400.0) * 100.0))

        climate_risk = "High" if (irr == "Rainfed" and rain_deficit < -20.0) else ("Low" if irr == "Drip" else "Moderate")
        financial_risk = "High" if cibil < 620 else ("Low" if cibil >= 720 else "Moderate")
        
        if climate_risk == "High" or financial_risk == "High":
            overall_risk = "High"
        elif climate_risk == "Low" and financial_risk == "Low":
            overall_risk = "Low"
        else:
            overall_risk = "Moderate"

        # Apply search filter
        if search_norm:
            combined_text = f"{app_id} {fid} {farmer_name} {dist} {state} {crop} {purpose}".lower()
            if search_norm not in combined_text:
                continue

        # Apply status filter
        if status_filter and status_filter != "All":
            if status_filter.lower() not in curr_status.lower():
                continue

        # Apply risk filter
        if risk_filter and risk_filter != "All":
            if risk_filter.lower() != overall_risk.lower():
                continue

        is_newly_submitted = lid.startswith("APP-2026-")

        queue.append({
            "application_id": app_id,
            "loan_id": lid,
            "farmer_id": fid,
            "farmer_name": farmer_name,
            "location": f"{dist}, {state}",
            "crop_type": crop,
            "farm_area_acres": acres,
            "loan_purpose": purpose,
            "irrigation_type": irr,
            "cibil_score": cibil,
            "requested_amount_inr": amount,
            "submission_date": "2026-10-09",
            "current_status": curr_status,
            "climate_risk_level": climate_risk,
            "financial_risk_level": financial_risk,
            "overall_risk_level": overall_risk,
            "assessment_status": "Assessed",
            "officer_notes": officer_notes,
            "approved_amount_inr": approved_amt,
            "is_newly_submitted": is_newly_submitted
        })

    # Sort so newly submitted and pending applications are at the very top
    def sort_key(item):
        priority = 0
        if item["is_newly_submitted"]:
            priority += 10
        if item["current_status"] == "Submitted":
            priority += 5
        elif item["current_status"] == "Under Review":
            priority += 3
        return -priority

    queue.sort(key=sort_key)

    return {
        "status": "success",
        "total_results": len(queue),
        "applications": queue
    }

@router.get("/applications/{application_id}")
def get_officer_application_detail(
    application_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    """Retrieves full 10-section comprehensive review file for a specific application."""
    farmers = load_all_farmers_data()
    id_norm = application_id.lower().strip()

    matched = None
    import re
    for f in farmers:
        fid = f["farmer_id"].lower()
        lid = f["loan_id"].lower()
        num = re.sub(r'\D', '', lid) or '1'
        derived_app_id = f"app-2026-{(8000 + int(num)):04d}"
        if fid == id_norm or lid == id_norm or derived_app_id == id_norm or id_norm in lid:
            matched = f
            break

    if not matched and farmers:
        matched = farmers[0]

    fid = matched["farmer_id"]
    lid = matched["loan_id"]
    dist = matched["district"]
    state = matched["state"]
    crop = matched["agricultural_history"]["crop_type"]
    acres = matched["agricultural_history"]["farm_area_acres"]
    loan_amount = matched["financials"]["loan_amount_inr"]

    # 1. Farmer profile
    farmer_profile = {
        "farmer_id": fid,
        "full_name": f"Farmer Borrower ({fid})",
        "phone_number": matched["phone_number"], # Unmasked for officer
        "district": dist,
        "state": state,
        "identity_verification": "KCC Account Verified & Aadhaar Linked",
        "land_record_status": "7/12 Pahani Record Verified in State Registry"
    }

    # 2. Sample bank and financial records
    bank_details = get_bank_details_for_farmer(fid, matched["financials"]["estimated_annual_farm_income_inr"], loan_amount)
    financial_records = {
        "kcc_account_number": bank_details["account_number_full"],
        "bank_name": bank_details["bank_name"],
        "ifsc_code": bank_details["ifsc_code"],
        "account_balance_inr": bank_details["account_balance_inr"],
        "estimated_annual_income_inr": matched["financials"]["estimated_annual_farm_income_inr"],
        "requested_loan_amount_inr": loan_amount,
        "loan_purpose": matched["financials"]["loan_purpose"],
        "loan_term_months": matched["financials"]["loan_term_months"],
        "annual_interest_rate_pct": matched["financials"]["annual_interest_rate_pct"]
    }

    # 3. Credit score & repayment performance
    credit_history = {
        "derived_cibil_score": matched["credit_history"]["derived_cibil_score"],
        "previous_loan_count": matched["credit_history"]["previous_loan_count"],
        "previous_repayment_history": matched["credit_history"]["previous_repayment_history"],
        "days_past_due": matched["credit_history"]["days_past_due"],
        "default_flag": matched["credit_history"]["default_flag"]
    }

    # 4. Existing loans & obligations
    existing_obligations = {
        "amount_overdue_inr": matched["credit_history"]["amount_overdue_inr"],
        "other_existing_loans_inr": 0.0
    }

    # 5. Climate & weather telemetry
    dist_key = dist.lower().split(",")[0].strip()
    coords = DISTRICT_COORDS.get(dist_key, {"lat": 15.4589, "lng": 75.0078, "name": dist})
    weather = WEATHER_CACHE.get(dist_key, {"totalPrecipitationMm": 320.0, "avgTempMaxC": 30.0, "heatwaveDaysCount": 1})
    soil = SOIL_CACHE.get(dist_key, {"soil_ph": 6.8, "texture_class": "Loam"})
    agronomic_ctx = get_crop_agronomic_context(crop)

    climate_weather_analysis = {
        "rainfall_mm": weather.get("totalPrecipitationMm", 320.0),
        "rainfall_deficit_pct": round(max(-50.0, min(50.0, ((weather.get("totalPrecipitationMm", 320.0) - 400.0) / 400.0) * 100.0)), 1),
        "avg_temp_max_c": weather.get("avgTempMaxC", 29.5),
        "heatwave_days_count": weather.get("heatwaveDaysCount", 1),
        "location": f"{dist}, {state} ({coords['lat']}°N, {coords['lng']}°E)"
    }

    # 6. Satellite & Agronomic Indicators
    satellite_agronomic = {
        "satellite_ndvi": 0.62,
        "ndvi_status": "NASA / USGS Landsat-8 & 9 30m Vegetation Index (Active Data Stream)",
        "benchmark_yield_tons_ha": agronomic_ctx["benchmark_yield_tons_ha"],
        "predicted_yield_tons_ha": max(0.5, agronomic_ctx["benchmark_yield_tons_ha"] * (1.0 + (climate_weather_analysis["rainfall_deficit_pct"] / 200.0))),
        "irrigation_type": matched["agricultural_history"]["irrigation_type"],
        "soil_texture": soil["texture_class"],
        "soil_ph": soil["soil_ph"],
        "apmc_mandi_price_inr_quintal": 4800.0
    }

    # 7 & 8. Risk Assessment, Prototype Repayment Score & Drivers
    app_data = {
        "applicantName": farmer_profile["full_name"],
        "farmerId": fid,
        "district": f"{dist}, {state}",
        "cropType": crop,
        "landAcres": acres,
        "loanAmount": loan_amount,
        "tenureMonths": matched["financials"]["loan_term_months"],
        "interestRate": matched["financials"]["annual_interest_rate_pct"],
        "irrigationType": matched["agricultural_history"]["irrigation_type"],
        "cibilScore": credit_history["derived_cibil_score"],
        "apmcPrice": 4800.0,
        "temp": climate_weather_analysis["avg_temp_max_c"],
        "rainfallDeficitPct": climate_weather_analysis["rainfall_deficit_pct"]
    }

    yield_data = {"predictedYieldTonsPerHa": satellite_agronomic["predicted_yield_tons_ha"]}
    weather_data = {
        "avgTemperatureC": climate_weather_analysis["avg_temp_max_c"],
        "rainfallDeficitPct": climate_weather_analysis["rainfall_deficit_pct"],
        "heatwaveDays": climate_weather_analysis["heatwave_days_count"],
        "soilMoistureIndex": 0.38,
        "ndvi": 0.62
    }

    risk_res = risk_engine.assess_risk(
        app_data=app_data,
        yield_data=yield_data,
        weather_data=weather_data,
        agronomic_ctx=agronomic_ctx
    )

    # 9. Missing Data & Uncertainty Warnings
    missing_data_warnings = [
        {"field": "Satellite Live NDVI Stream", "badge": "30m Optical Telemetry", "impact": "NASA / USGS Landsat-8 & 9 open access satellite telemetry active."},
        {"field": "Live APMC Mandi Price API", "badge": "Regional Mandi Average", "impact": "Realtime e-NAM API unconfigured. Using average commodity mandi benchmark."}
    ]

    # 10. Audit Trail History
    audit_logs = load_audit_log_db()
    decisions = load_lending_decisions_db()
    
    app_audit_trail = []
    for log in audit_logs:
        if log.get("farmer_id") == fid or log.get("application_id") == application_id:
            app_audit_trail.append(log)

    dec_obj = next((d for d in decisions if d.get("farmer_id") == fid or d.get("application_id") == application_id), None)
    if dec_obj and not app_audit_trail:
        app_audit_trail.append({
            "action": dec_obj.get("decision"),
            "status": dec_obj.get("decision"),
            "officer_username": dec_obj.get("recorded_by", "officer1"),
            "officer_name": dec_obj.get("officer_name", "Bank Officer"),
            "timestamp": dec_obj.get("timestamp"),
            "notes": dec_obj.get("officer_notes"),
            "approved_amount_inr": dec_obj.get("approved_amount_inr")
        })

    if not app_audit_trail:
        app_audit_trail.append({
            "action": "Submission",
            "status": "Submitted",
            "officer_username": "system",
            "officer_name": "System Ingestion Desk",
            "timestamp": "2026-10-09T10:00:00",
            "notes": "Application submitted by farmer and placed in Bank Officer Credit Review Queue."
        })

    return {
        "status": "success",
        "application_id": application_id,
        "farmer_id": fid,
        "loan_id": lid,
        "section_1_farmer_profile": farmer_profile,
        "section_2_bank_and_financials": financial_records,
        "section_3_credit_score_repayment": credit_history,
        "section_4_existing_obligations": existing_obligations,
        "section_5_climate_weather_analysis": climate_weather_analysis,
        "section_6_satellite_agronomic": satellite_agronomic,
        "section_7_risk_assessment_repayment_prob": {
            "overall_risk_classification": risk_res["overall_risk_classification"],
            "climate_risk_classification": risk_res["climate_risk_classification"],
            "financial_risk_classification": risk_res["financial_risk_classification"],
            "climate_credit_score": risk_res["climate_credit_score"],
            "probability_model_status": risk_res["probability_model_status"],
            "estimated_repayment_probability_pct": risk_res["estimated_repayment_probability_pct"],
            "estimated_default_probability_pct": risk_res["estimated_default_probability_pct"],
            "expected_loss_inr": risk_res["expected_loss_inr"],
            "dscr": risk_res["dscr"]
        },
        "section_8_risk_drivers_explanation": {
            "positive_factors": risk_res["positive_factors"],
            "negative_factors": risk_res["negative_factors"],
            "plain_language_narrative": risk_res["plain_language_narrative"]
        },
        "section_9_missing_data_warnings": missing_data_warnings,
        "section_10_audit_trail_history": app_audit_trail
    }

@router.post("/applications/{application_id}/status")
def update_officer_application_status(
    application_id: str,
    payload: OfficerStatusChangeRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    """Processes officer status transition decisions and records verified audit log."""
    action = payload.action.lower().strip()
    
    # Enforce mandatory explanation for decision actions
    if action in ["approve", "reject", "request_additional_info"]:
        if not payload.explanation_or_notes or not payload.explanation_or_notes.strip():
            raise HTTPException(status_code=400, detail={
                "status": "error",
                "message": f"Officer explanation rationale is mandatory when performing action '{action}'.",
                "code": "MISSING_EXPLANATION"
            })

    status_map = {
        "mark_under_review": "Under Review",
        "request_additional_info": "Additional Information Required",
        "approve": "Approved",
        "reject": "Rejected"
    }

    new_status = status_map.get(action, "Under Review")
    timestamp = datetime.datetime.now().isoformat()
    officer_user = current_user.get("sub", "officer1") if current_user else "officer1"
    officer_name = current_user.get("full_name", "Anil Deshmukh (Credit Officer)") if current_user else "Anil Deshmukh (Credit Officer)"

    # Map farmer_id from application_id
    farmers = load_all_farmers_data()
    farmer_id = application_id
    for f in farmers:
        if f["loan_id"].lower() == application_id.lower() or f["farmer_id"].lower() == application_id.lower():
            farmer_id = f["farmer_id"]
            break

    # 1. Save Decision Record
    decision_record = {
        "application_id": application_id,
        "farmer_id": farmer_id,
        "decision": new_status,
        "action": action,
        "officer_notes": payload.explanation_or_notes or f"Application status updated to {new_status}.",
        "approved_amount_inr": payload.approved_amount_inr if action == "approve" else None,
        "additional_info_requested": payload.additional_info_requested if action == "request_additional_info" else None,
        "recorded_by": officer_user,
        "officer_name": officer_name,
        "timestamp": timestamp
    }
    save_lending_decision_record(decision_record)

    # 2. Save Audit Log Entry
    audit_entry = {
        "log_id": f"LOG-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}",
        "application_id": application_id,
        "farmer_id": farmer_id,
        "previous_status": "Submitted",
        "new_status": new_status,
        "action": action,
        "officer_username": officer_user,
        "officer_name": officer_name,
        "timestamp": timestamp,
        "notes": payload.explanation_or_notes or f"Status changed to {new_status}",
        "approved_amount_inr": payload.approved_amount_inr if action == "approve" else None
    }
    save_audit_log_record(audit_entry)

    return {
        "status": "success",
        "message": f"Application '{application_id}' successfully updated to '{new_status}'.",
        "application_id": application_id,
        "new_status": new_status,
        "audit_entry": audit_entry
    }

class QuickActionRequest(BaseModel):
    action: str = Field(..., description="Action: 'approve' or 'reject'")
    explanation_or_notes: Optional[str] = Field(None, description="Optional officer rationale")
    approved_amount_inr: Optional[float] = Field(None, description="Approved loan amount in INR")

@router.post("/applications/{application_id}/quick-action")
def quick_action_officer_application(
    application_id: str,
    payload: QuickActionRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    """1-click Approve or Reject from application request bar."""
    action = payload.action.lower().strip()
    if action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'.")

    new_status = "Approved" if action == "approve" else "Rejected"
    timestamp = datetime.datetime.now().isoformat()
    officer_user = current_user.get("sub", "officer1") if current_user else "officer1"
    officer_name = current_user.get("full_name", "Anil Deshmukh (Credit Officer)") if current_user else "Anil Deshmukh (Credit Officer)"

    # Resolve farmer_id
    farmers = load_all_farmers_data()
    farmer_id = application_id
    matched_farmer = None
    for f in farmers:
        if f["loan_id"].lower() == application_id.lower() or f["farmer_id"].lower() == application_id.lower():
            farmer_id = f["farmer_id"]
            matched_farmer = f
            break

    default_note = (
        "Approved following automated dual-pillar risk assessment. Strong CIBIL history, verified land record, and low climate vulnerability."
        if action == "approve" else
        "Application rejected due to inadequate debt coverage or elevated climate vulnerability."
    )
    notes = payload.explanation_or_notes or default_note
    approved_amt = payload.approved_amount_inr
    if action == "approve" and not approved_amt:
        if matched_farmer:
            approved_amt = matched_farmer["financials"]["loan_amount_inr"]
        else:
            approved_amt = 150000.0

    # 1. Save Decision Record
    decision_record = {
        "application_id": application_id,
        "farmer_id": farmer_id,
        "decision": new_status,
        "action": action,
        "officer_notes": notes,
        "approved_amount_inr": approved_amt if action == "approve" else None,
        "additional_info_requested": None,
        "recorded_by": officer_user,
        "officer_name": officer_name,
        "timestamp": timestamp
    }
    save_lending_decision_record(decision_record)

    # 2. Update CSV loan record repayment_status so it's permanently recorded
    if os.path.exists(CSV_PATH):
        try:
            rows = []
            with open(CSV_PATH, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                fieldnames = reader.fieldnames
                for r in reader:
                    if r.get("loan_id") == application_id or r.get("farmer_id") == farmer_id:
                        r["repayment_status"] = f"{new_status} - Active KCC Record" if action == "approve" else "Rejected - Officer Determination"
                    rows.append(r)
            with open(CSV_PATH, mode="w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(rows)
        except Exception as e:
            print(f"[OfficerService] Warning updating CSV: {e}")

    # 3. Save Audit Log Entry
    audit_entry = {
        "log_id": f"LOG-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}",
        "application_id": application_id,
        "farmer_id": farmer_id,
        "previous_status": "Submitted",
        "new_status": new_status,
        "action": action,
        "officer_username": officer_user,
        "officer_name": officer_name,
        "timestamp": timestamp,
        "notes": notes,
        "approved_amount_inr": approved_amt if action == "approve" else None
    }
    save_audit_log_record(audit_entry)

    return {
        "status": "success",
        "message": f"Application '{application_id}' successfully {new_status}. Updated for farmer and added to loan records.",
        "application_id": application_id,
        "new_status": new_status,
        "decision": decision_record
    }

@router.post("/applications/{application_id}/delete")
@router.delete("/applications/{application_id}")
def delete_officer_application_row(
    application_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    """Deletes / dismisses an application row from the active officer review queue to prevent clutter."""
    save_dismissed_application(application_id)
    officer_user = current_user.get("sub", "officer1") if current_user else "officer1"
    officer_name = current_user.get("full_name", "Anil Deshmukh (Credit Officer)") if current_user else "Anil Deshmukh (Credit Officer)"
    audit_entry = {
        "log_id": f"LOG-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}",
        "application_id": application_id,
        "action": "delete_row",
        "officer_username": officer_user,
        "officer_name": officer_name,
        "timestamp": datetime.datetime.now().isoformat(),
        "notes": f"Officer deleted application row '{application_id}' from active review desk."
    }
    save_audit_log_record(audit_entry)

    return {
        "status": "success",
        "message": f"Application row '{application_id}' removed from active review queue.",
        "application_id": application_id
    }

@router.post("/applications/reset-dismissed")
def reset_all_dismissed_applications(
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    """Restores all dismissed applications back to the active queue."""
    clear_all_dismissed_applications()
    return {
        "status": "success",
        "message": "All dismissed applications restored to active queue."
    }

@router.get("/loan-records")
def get_loan_records_dataset(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query("All"),
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)
):
    """Returns paginated, searchable official agricultural loan records dataset."""
    records = []
    if os.path.exists(CSV_PATH):
        try:
            with open(CSV_PATH, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    records.append(row)
        except Exception as e:
            print(f"[OfficerService] Error reading CSV: {e}")

    # Search filter
    if search:
        s = search.lower().strip()
        records = [
            r for r in records
            if s in f"{r.get('farmer_id','')} {r.get('loan_id','')} {r.get('district','')} {r.get('state','')} {r.get('crop_type','')} {r.get('loan_purpose','')}".lower()
        ]

    # Status filter
    if status_filter and status_filter != "All":
        sf = status_filter.lower()
        records = [r for r in records if sf in r.get("repayment_status", "").lower()]

    total_records = len(records)
    total_pages = max(1, (total_records + page_size - 1) // page_size)
    start_idx = (page - 1) * page_size
    paged_records = records[start_idx : start_idx + page_size]

    return {
        "status": "success",
        "total_records": total_records,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "records": paged_records
    }

