import os

search_dir = r"c:\project\antigravity\vijayfinal\Final_form"
term = "Select Borrower Loan Application"

for root, dirs, files in os.walk(search_dir):
    for f in files:
        if f.endswith(('.html', '.js', '.css')):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                for idx, line in enumerate(fp):
                    if term.lower() in line.lower():
                        print(f"{path}:{idx+1}: {line.strip()}")
