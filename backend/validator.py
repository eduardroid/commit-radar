# backend/validator.py
from typing import Any, Dict, List


def _normalize_commit_score(data: Dict[str, Any]) -> Dict[str, Any]:
    score = data.get("commitScore") or {}
    value_raw = score.get("value", 50)

    try:
        value = int(value_raw)
    except (ValueError, TypeError):
        value = 50

    if value < 0:
        value = 0
    if value > 100:
        value = 100

    if value >= 80:
        label = "Green"
    elif value >= 50:
        label = "Yellow"
    else:
        label = "Red"

    return {"value": value, "label": label}


def _normalize_str_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if not isinstance(value, list):
        return []

    result: List[str] = []
    for item in value:
        if isinstance(item, str):
            result.append(item)
        else:
            result.append(str(item))
    return result


def _normalize_suggested_message(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def _normalize_risk_level(value: Any) -> str:
    allowed = {"Low", "Medium", "High"}
    if isinstance(value, str) and value in allowed:
        return value
    # default razonable
    return "Medium"


def validate_response(data: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(data, dict):
        data = {}

    # 1. commitScore
    data["commitScore"] = _normalize_commit_score(data)

    # 2. flags
    data["flags"] = _normalize_str_list(data.get("flags"))

    # 3. suggestions
    data["suggestions"] = _normalize_str_list(data.get("suggestions"))

    # 4. suggestedMessage
    data["suggestedMessage"] = _normalize_suggested_message(
        data.get("suggestedMessage", "")
    )

    # 5. riesgo
    data["riskLevel"] = _normalize_risk_level(data.get("riskLevel"))
    data["riskReasons"] = _normalize_str_list(data.get("riskReasons"))

    return data
