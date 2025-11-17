# backend/lab_run.py
from pathlib import Path
import json

from .analyzer import analyze_commit
from .post_rules import count_changed_lines, extract_files_from_diff


EXAMPLES = [
    ("examples/green_cart.diff", "feat(cart): add total calculation with tests"),
    ("examples/red_update.diff", "update"),
    ("examples/medium_refactor.diff", "refactor(order): split calculation into helper"),
    ("examples/tiny_fix.diff", "fix(api): handle null user id"),
]


def run():
    base_dir = Path(__file__).resolve().parent
    for rel_path, message in EXAMPLES:
        path = base_dir / rel_path
        diff = path.read_text(encoding="utf-8")

        print("========================================")
        print(f"FILE: {rel_path}")
        print(f"MESSAGE: {message}")
        print("----------------------------------------")

        # Datos rápidos del diff
        files = extract_files_from_diff(diff)
        total_changed = count_changed_lines(diff)
        print(f"Files touched: {files}")
        print(f"Changed lines: {total_changed}")
        print()

        result = analyze_commit(diff=diff, message=message, repo_name="lab-repo")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        print()

if __name__ == "__main__":
    run()
