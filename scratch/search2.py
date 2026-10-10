import os

search_dir = r"c:\project\antigravity\vijayfinal\Final_form"
terms = ["risk-borrower-select", "Select Borrower Loan", "100 Borrower Dataset", "Evaluate Entire Portfolio", "risk_borrower", "officer-borrower-select", "farmer-select", "current_user", "getcurrentUser"]

for root, dirs, files in os.walk(search_dir):
    if 'scratch' in root or '.git' in root:
        continue
    for f in files:
        if f.endswith(('.html', '.js', '.css', '.py')):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                for idx, line in enumerate(fp):
                    for term in terms:
                        if term.lower() in line.lower():
                            print(f"{os.path.relpath(path, search_dir)}:{idx+1}: [{term}] {line.strip()[:120]}")
