# test_analyze.py
import requests
from pathlib import Path

API_URL = "http://localhost:8000/analyze"

def load_diff(path: str = "sample.diff") -> str:
    """
    Lee el contenido completo de sample.diff y lo devuelve como string.
    """
    return Path(path).read_text(encoding="utf-8")

def main():
    diff = load_diff("./../sample.diff")

    payload = {
        "diff": diff,
        "message": "update",
        "repo_name": "demo-repo"
    }

    response = requests.post(API_URL, json=payload)

    print("Status:", response.status_code)
    try:
        print("Response JSON:")
        print(response.json())
    except Exception:
        print("Response text:")
        print(response.text)

if __name__ == "__main__":
    main()
