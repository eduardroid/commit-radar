# commitcoach/analyzer.py
import json
from .llm_client import ask_commitcoach
from .validator import validate_response
from pathlib import Path

# Directorio base de este módulo (backend/)
BASE_DIR = Path(__file__).resolve().parent

def load_file(path: str) -> str:
    """
    Lee el contenido completo de sample.diff y lo devuelve como string.
    """
    return (BASE_DIR / path).read_text(encoding="utf-8")

def analyze_commit(diff: str, message: str, repo_name: str = "") -> dict:
    user_input = f"""
Repositorio: {repo_name}

Mensaje de commit:
{message}

Diff:
{diff}

Recuerda:
- Responde SOLO con un JSON válido.
- Usa el esquema indicado en el prompt del sistema.
"""
    
    system_prompt = load_file("system_prompt.txt")
    raw = ask_commitcoach(system_prompt, user_input)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        # Para debug: ver qué está mandando el modelo cuando falla
        print("===== LLM RAW OUTPUT (INVALID JSON) =====")
        print(raw)
        print("=========================================")
        # Puedes levantar una excepción más clara
        raise RuntimeError(f"Modelo devolvió JSON inválido: {e}") from e

    return validate_response(parsed)
