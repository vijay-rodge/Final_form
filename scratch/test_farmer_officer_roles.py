import os
import sys
import json
from fastapi.testclient import TestClient

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)
sys.path.append(os.path.join(BASE_DIR, "backend"))

from backend.main import app

client = TestClient(app)

def test_roles():
    # 1. Farmer login
    f_login = client.post("/api/v2/auth/login", json={"username": "farmer1", "password": "farmer123", "login_type": "farmer"})
    assert f_login.status_code == 200, f_login.text
    f_token = f_login.json()["access_token"]
    f_headers = {"Authorization": f"Bearer {f_token}"}

    # Farmer dashboard call
    f_dash = client.get("/api/v2/farmers/me/dashboard", headers=f_headers)
    assert f_dash.status_code == 200
    fd_data = f_dash.json()
    assert fd_data["status"] == "success"
    assert fd_data["authenticated_user"]["role"] == "farmer"
    assert fd_data["authenticated_user"]["farmer_id"] == "DEMO001"
    assert len(fd_data["applications"]) > 0
    print("Farmer applications count:", len(fd_data["applications"]))
    for app_item in fd_data["applications"]:
        print("  - App:", app_item["application_id"], app_item["requested_amount_inr"], app_item["status"], app_item["officer_notes"])

    # 2. Officer login
    o_login = client.post("/api/v2/auth/login", json={"username": "officer1", "password": "officer123", "login_type": "officer"})
    assert o_login.status_code == 200, o_login.text
    o_token = o_login.json()["access_token"]
    o_headers = {"Authorization": f"Bearer {o_token}"}

    # Officer calling farmer dashboard endpoint returns officer_role status
    o_dash = client.get("/api/v2/farmers/me/dashboard", headers=o_headers)
    assert o_dash.status_code == 200
    od_data = o_dash.json()
    assert od_data.get("status") == "officer_role"
    print("Officer calling /farmers/me/dashboard correctly received officer_role status.")

    print("Role separation test passed!")

if __name__ == "__main__":
    test_roles()
