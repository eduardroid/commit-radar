# commitcoach/validator.py

from typing import Any, Dict, List


def _normalize_commit_score(data: Dict[str, Any]) -> Dict[str, Any]:
    score = data.get("commitScore") or {}
    value_raw = score.get("value", 50)

    # Convertir a int de forma segura
    try:
        value = int(value_raw)
    except (ValueError, TypeError):
        value = 50

    # Clamp 0–100
    if value < 0:
        value = 0
    if value > 100:
        value = 100

    # SIEMPRE recalculamos label según value
    if value >= 80:
        label = "Green"
    elif value >= 50:
        label = "Yellow"
    else:
        label = "Red"

    return {"value": value, "label": label}


def _normalize_str_list(value: Any) -> List[str]:
    """
    Asegura que el valor sea una lista de strings.
    - Si viene un string → [string]
    - Si viene otra cosa → []
    - Si hay elementos no-string → se convierten con str().
    """
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


def validate_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normaliza la respuesta del modelo para que cumpla el schema oficial:

    {
      "commitScore": { "value": int 0-100, "label": "Green|Yellow|Red" },
      "flags": [string],
      "suggestions": [string],
      "suggestedMessage": string
    }
    """

    if not isinstance(data, dict):
        # En caso extremo, devolver defaults hardcodeados
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

    # Opcional: si quieres, podrías limpiar campos extra aquí
    # allowed_keys = {"commitScore", "flags", "suggestions", "suggestedMessage"}
    # data = {k: v for k, v in data.items() if k in allowed_keys}

    return data
