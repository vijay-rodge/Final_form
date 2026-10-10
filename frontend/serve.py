"""
AgriSure SPA Local Development Server
Serves clean path URLs (/login, /dashboard, /farmer, /officer, etc.) on http://localhost:8080
"""

import os
import sys
import http.server
import socketserver

PORT = 8080
if len(sys.argv) > 1 and sys.argv[1].isdigit():
    PORT = int(sys.argv[1])

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

class SPAServerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PROJECT_ROOT, **kwargs)

    def do_GET(self):
        # Determine physical file path
        url_path = self.path.split('?')[0].split('#')[0]
        file_path = os.path.join(PROJECT_ROOT, url_path.lstrip('/'))

        # If path is a clean SPA route (not a real static file on disk), serve index.html
        if not os.path.exists(file_path) and not url_path.startswith('/api'):
            self.path = '/index.html'

        return super().do_GET()

if __name__ == '__main__':
    print(f"[AgriSure SPA Dev Server] Starting clean URL server on http://localhost:{PORT} ...")
    print(f"   Serving SPA routes (/login, /dashboard, /officer, /farmer, etc.) -> index.html")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), SPAServerHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
