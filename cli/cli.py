import argparse
import subprocess
import os
from pathlib import Path
import json

from backend.analyzer import analyze_commit

# ANSI colors
RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
CYAN = "\033[36m"
GRAY = "\033[90m"


def get_git_root() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def get_staged_diff() -> str:
    result = subprocess.run(
        ["git", "diff", "--cached"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


def label_color_and_emoji(label: str):
    label = (label or "").capitalize()
    if label == "Green":
        return GREEN, "🟢"
    if label == "Yellow":
        return YELLOW, "🟡"
    if label == "Red":
        return RED, "🔴"
    return CYAN, "⚪"


def print_pretty_report(result: dict, repo_name: str, message: str):
    score = result["commitScore"]["value"]
    label = result["commitScore"]["label"]
    flags = result.get("flags", [])
    suggestions = result.get("suggestions", [])
    suggested = result.get("suggestedMessage", "")

    risk_level = result.get("riskLevel", "Medium")
    risk_reasons = result.get("riskReasons", [])

    color, emoji = label_color_and_emoji(label)

    # Mapear riesgo a icono
    risk_icon = {
        "High": "🚨",
        "Medium": "⚠️",
        "Low": "✅",
    }.get(risk_level, "⚪")

    print(f"{BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RESET}")
    print(f"{BOLD}          CommitCoach Report          {RESET}")
    print(f"{BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RESET}")
    print(f"{BOLD}Repo:{RESET} {repo_name}")
    print(f"{BOLD}Message:{RESET} {message}")
    print()
    print(f"{BOLD}Score:{RESET} {color}{score} ({label}) {emoji}{RESET}")
    print(f"{BOLD}Risk:{RESET} {risk_level} {risk_icon}")
    if risk_reasons:
        for rr in risk_reasons:
            print(f"  - {rr}")
    else:
        print(f"  {GRAY}- (sin razones específicas){RESET}")
    print()

    print(f"{BOLD}Flags:{RESET}")
    if not flags:
        print(f"  {GRAY}- (sin flags){RESET}")
    else:
        for f in flags:
            print(f"  - {f}")
    print()

    print(f"{BOLD}Suggestions:{RESET}")
    if not suggestions:
        print(f"  {GRAY}- (sin sugerencias){RESET}")
    else:
        for s in suggestions:
            print(f"  - {s}")
    print()

    print(f"{BOLD}Suggested commit message:{RESET}")
    if suggested:
        print(f"  {CYAN}{suggested}{RESET}")
    else:
        print(f"  {GRAY}(no hay sugerencia específica){RESET}")
    print(f"{BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RESET}")


def main():
    parser = argparse.ArgumentParser(description="CommitCoach CLI")
    parser.add_argument(
        "--message",
        "-m",
        help="Mensaje de commit (si no se pasa, usa '(sin mensaje de commit)' )",
        default="",
    )
    parser.add_argument(
        "--staged",
        action="store_true",
        help="Analizar el diff staged (git diff --cached)",
    )
    parser.add_argument(
        "--diff-file",
        help="Ruta a un archivo .diff en vez de usar git",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Imprimir solo JSON (útil para hooks/automatización)",
    )

    args = parser.parse_args()

    # Obtener diff
    if args.diff_file:
        diff = Path(args.diff_file).read_text(encoding="utf-8")
        repo_name = Path(".").resolve().name
    else:
        repo_root = get_git_root()
        os.chdir(repo_root)
        if args.staged:
            diff = get_staged_diff()
        else:
            # diff de working tree
            result = subprocess.run(
                ["git", "diff"],
                capture_output=True,
                text=True,
                check=True,
            )
            diff = result.stdout
        repo_name = Path(repo_root).name

    if not diff.strip():
        print("No hay cambios para analizar (diff vacío).")
        return

    message = args.message or "(sin mensaje de commit)"

    result = analyze_commit(diff=diff, message=message, repo_name=repo_name)

    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print_pretty_report(result, repo_name, message)


if __name__ == "__main__":
    main()
