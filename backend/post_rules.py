# backend/post_rules.py
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List


# ----------------- Helpers de análisis de diff ----------------- #

def has_debug_statements(diff: str) -> bool:
    """
    Detecta prints / logs típicos añadidos en el diff.
    Solo miramos líneas añadidas (+...).
    """
    for line in diff.splitlines():
        if not line.startswith("+"):
            continue
        stripped = line[1:].lstrip()  # quita '+' y espacios
        if stripped.startswith("print("):
            return True
        if "console.log(" in stripped:
            return True
        if "debugger" in stripped:
            return True
        if "System.out.println(" in stripped:
            return True
        if "fmt.Println(" in stripped:
            return True
    return False


def extract_files_from_diff(diff: str) -> List[str]:
    """
    Extrae rutas de archivos tocados a partir de un diff 'git diff'.
    Busca líneas tipo:
      diff --git a/ruta/archivo.py b/ruta/archivo.py
    y devuelve la ruta 'b/...'.
    """
    files = []
    for line in diff.splitlines():
        if line.startswith("diff --git "):
            parts = line.split()
            if len(parts) >= 4:
                b_path = parts[3]
                # típicamente viene como "b/ruta/archivo.py"
                if b_path.startswith("b/"):
                    b_path = b_path[2:]
                files.append(b_path)
    return files


def count_changed_lines(diff: str) -> int:
    """
    Cuenta líneas añadidas/eliminadas (las que empiezan con '+' o '-'
    excluyendo cabeceras tipo '+++', '---').
    """
    lines = 0
    for line in diff.splitlines():
        if not line:
            continue
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+") or line.startswith("-"):
            lines += 1
    return lines


def has_test_files(files: List[str]) -> bool:
    """
    True si hay archivos de test según heurística simple.
    """
    for f in files:
        lf = f.lower()
        if lf.startswith("tests/") or "/tests/" in lf:
            return True
        if lf.endswith("_test.py") or lf.endswith("test.py"):
            return True
    return False


def has_only_tests(files: List[str]) -> bool:
    if not files:
        return False
    if not has_test_files(files):
        return False
    # si todos parecen tests, lo consideramos "solo tests"
    test_like = 0
    for f in files:
        lf = f.lower()
        if (
            lf.startswith("tests/")
            or "/tests/" in lf
            or lf.endswith("_test.py")
            or lf.endswith("test.py")
        ):
            test_like += 1
    return test_like == len(files)


def has_mixed_concerns(files: List[str]) -> bool:
    """
    Heurística: mezcla fuerte de áreas, p.ej. backend + frontend.
    """
    has_backend = any(f.endswith((".py", ".cs", ".java", ".go", ".rb", ".ts", ".tsx")) for f in files)
    has_frontend_assets = any(
        f.endswith((".css", ".scss", ".sass", ".html", ".vue"))
        for f in files
    )
    return has_backend and has_frontend_assets


def message_looks_conventional(message: str) -> bool:
    """
    Heurística para Conventional Commits: type(scope?): description
    """
    message = (message or "").strip()
    prefixes = ["feat", "fix", "refactor", "chore", "docs", "test", "style", "perf"]
    if ":" not in message:
        return False
    first = message.split(":", 1)[0].strip()  # ej: feat(cart)
    # quita scope si existe
    for p in prefixes:
        if first == p or first.startswith(f"{p}("):
            return True
    return False


# ----------------- Reglas de negocio CommitCoach ----------------- #

def apply_post_rules(data: Dict[str, Any], diff: str, message: str) -> Dict[str, Any]:
    """
    Aplica reglas propias de CommitCoach encima de la respuesta del modelo.

    Ajusta:
    - commitScore.value
    - flags
    - riskLevel / riskReasons
    """
    flags: List[str] = data.get("flags", []) or []
    score: int = int(data.get("commitScore", {}).get("value", 50))

    files = extract_files_from_diff(diff)
    total_changed = count_changed_lines(diff)
    has_tests = has_test_files(files)
    only_tests = has_only_tests(files)
    mixed = has_mixed_concerns(files)
    debug = has_debug_statements(diff)

    risk_score = 0
    risk_reasons: List[str] = data.get("riskReasons", []) or []

    # 1) Tamaño del commit
    if total_changed > 800:
        score -= 15
        if "Very large diff" not in flags:
            flags.append("Very large diff")
        risk_score += 2
        risk_reasons.append("Very large diff")
    elif total_changed > 400:
        score -= 8
        if "Commit bigger than recommended" not in flags:
            flags.append("Commit bigger than recommended")
        risk_score += 1
        risk_reasons.append("Large diff")
    elif total_changed > 200:
        score -= 4
        if "Commit slightly bigger than recommended" not in flags:
            flags.append("Commit slightly bigger than recommended")
        risk_score += 1
        risk_reasons.append("Medium-sized diff")

    # 2) Tests
    if not only_tests and total_changed > 80 and not has_tests:
        score -= 10
        if "Missing tests" not in flags:
            flags.append("Missing tests")
        risk_score += 2
        risk_reasons.append("Significant change without tests")

    if only_tests:
        score += 5
        if "Test-only change" not in flags:
            flags.append("Test-only change")
        # test-only suele ser bajo riesgo, no sumamos riesgo aquí

    # 3) Mezcla de concerns (backend + estilos)
    if mixed:
        score -= 5
        if "Mixed concerns (logic + styles)" not in flags:
            flags.append("Mixed concerns (logic + styles)")
        risk_score += 1
        risk_reasons.append("Mixed concerns (logic + styles)")

    # 4) Debug prints / logs
    if debug:
        score -= 3
        if "Debug prints present" not in flags:
            flags.append("Debug prints present")
        risk_score += 1
        risk_reasons.append("Debug prints present")

    # 5) Calidad del mensaje de commit (Conventional Commits)
    if message_looks_conventional(message):
        score += 5
        if "Commit message follows Conventional Commits" not in flags:
            flags.append("Commit message follows Conventional Commits")
    else:
        score -= 5
        if "Commit message could follow Conventional Commits" not in flags:
            flags.append("Commit message could follow Conventional Commits")
        risk_score += 1
        risk_reasons.append("Commit message not following Conventional Commits")

    # Clamp score 0–100
    if score < 0:
        score = 0
    if score > 100:
        score = 100

    data["commitScore"]["value"] = score
    data["flags"] = flags

    # Mapear risk_score numérico a Low / Medium / High
    if risk_score >= 3:
        risk_level = "High"
    elif risk_score >= 1:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    data["riskLevel"] = risk_level
    data["riskReasons"] = risk_reasons

    return data
