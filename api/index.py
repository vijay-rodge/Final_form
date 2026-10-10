import os
import sys

# Ensure backend directory is in sys.path for Vercel Serverless Function runtime
backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from main import app

# Export top-level FastAPI instance for Vercel
__all__ = ["app"]
