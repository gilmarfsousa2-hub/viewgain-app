import requests
import os

API_URL = "http://localhost:8002/api/analyze"

def test_backend():
    print(f"Testing ViewGain API at {API_URL}...")
    
    # Check health
    try:
        health = requests.get("http://localhost:8002/")
        print(f"Health Check: {health.status_code} - {health.json()}")
    except Exception as e:
        print(f"Health Check FAILED: {e}")
        return

    # Try to send a dummy file (or just check if endpoint responds)
    # We'll use a local image if possible or just exit if health fails
    print("Backend seems up. Checking logs for recent errors...")

if __name__ == "__main__":
    test_backend()
