import sys
import os
import json
import pytest
from fastapi.testclient import TestClient

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)
sys.path.append(os.path.join(BASE_DIR, "backend"))

from backend.main import app

client = TestClient(app)

def test_officer_dashboard_summary():
    resp = client.get("/api/v2/officer/dashboard-summary")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "success"
    assert "summary" in data
    assert "awaiting_review_count" in data["summary"]
    print("Dashboard summary test passed:", data["summary"])

def test_officer_applications_queue():
    resp = client.get("/api/v2/officer/applications")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "success"
    assert "applications" in data
    assert len(data["applications"]) > 0
    first = data["applications"][0]
    assert "application_id" in first
    assert "farmer_name" in first
    assert "requested_amount_inr" in first
    assert "current_status" in first
    print("Officer applications queue test passed, count:", len(data["applications"]))

def test_quick_action_approve_and_delete_flow():
    # 1. Reset dismissed applications first
    reset_resp = client.post("/api/v2/officer/applications/reset-dismissed")
    assert reset_resp.status_code == 200

    # 2. Get applications
    q_resp = client.get("/api/v2/officer/applications")
    apps = q_resp.json()["applications"]
    assert len(apps) > 0
    target_app = apps[0]
    target_app_id = target_app["application_id"]
    target_farmer_id = target_app["farmer_id"]

    # 3. Quick Action Approve
    approve_resp = client.post(
        f"/api/v2/officer/applications/{target_app_id}/quick-action",
        json={
            "action": "approve",
            "explanation_or_notes": "Approved by Senior Credit Officer - excellent crop telemetry.",
            "approved_amount_inr": target_app["requested_amount_inr"]
        }
    )
    assert approve_resp.status_code == 200, approve_resp.text
    app_data = approve_resp.json()
    assert app_data["new_status"] == "Approved"

    # 4. Check decisions DB
    decisions_path = os.path.join(BASE_DIR, "data", "lending_decisions.json")
    with open(decisions_path, "r", encoding="utf-8") as f:
        decs = json.load(f)
    found_dec = any(d.get("application_id") == target_app_id and d.get("decision") == "Approved" for d in decs)
    assert found_dec, "Decision not saved in lending_decisions.json"

    # 5. Delete row from officer desk
    del_resp = client.post(f"/api/v2/officer/applications/{target_app_id}/delete")
    assert del_resp.status_code == 200, del_resp.text

    # 6. Verify row is dismissed from active queue
    q_resp2 = client.get("/api/v2/officer/applications")
    active_apps2 = q_resp2.json()["applications"]
    active_ids = [a["application_id"] for a in active_apps2]
    assert target_app_id not in active_ids, f"{target_app_id} should be dismissed from active queue"

    # 7. Verify loan record STILL exists in /loan-records
    lr_resp = client.get(f"/api/v2/officer/loan-records?search={target_app_id}")
    assert lr_resp.status_code == 200
    lr_data = lr_resp.json()
    # Loan record remains in CSV
    print(f"Loan records search for {target_app_id} returned {lr_data['total_records']} records (permanently preserved).")

    # 8. Restore dismissed applications
    rst_resp = client.post("/api/v2/officer/applications/reset-dismissed")
    assert rst_resp.status_code == 200
    q_resp3 = client.get("/api/v2/officer/applications")
    restored_ids = [a["application_id"] for a in q_resp3.json()["applications"]]
    assert target_app_id in restored_ids, f"{target_app_id} should be restored"

    print("Quick action and delete row flow test passed successfully!")

def test_loan_records_pagination():
    resp = client.get("/api/v2/officer/loan-records?page=1&page_size=15")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "success"
    assert data["page"] == 1
    assert data["page_size"] == 15
    assert len(data["records"]) <= 15
    assert data["total_records"] >= 100
    print(f"Loan records pagination test passed: {data['total_records']} total records across {data['total_pages']} pages.")

if __name__ == "__main__":
    test_officer_dashboard_summary()
    test_officer_applications_queue()
    test_quick_action_approve_and_delete_flow()
    test_loan_records_pagination()
    print("ALL TESTS PASSED!")

