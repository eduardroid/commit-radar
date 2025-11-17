# CommitCoach Response Schema

Versión: **v0.1 (MVP)**  
Última actualización: 2025-11-17

Este documento define el formato **oficial** de la respuesta que debe devolver el analizador de commits de CommitCoach (modelo + backend).  
Cualquier cliente (CLI, VS Code, web, GitHub App) debe asumir este contrato.

---

## 1. Estructura general

La respuesta SIEMPRE debe ser un JSON con esta forma:

```json
{
  "commitScore": {
    "value": 0,
    "label": "Yellow"
  },
  "flags": [],
  "suggestions": [],
  "suggestedMessage": ""
}
```

## 2.Puntuacion 
Green: 80–100

Buen commit. Claro, enfocado, sin red flags graves. Se puede mergear con tweaks menores.

Yellow: 50–79

Aprobado con reservas. Hay cosas que mejorar (mensaje, tamaño, tests, claridad), pero no es un desastre.

Red: 0–49

Commit problemático. Debería revisarse antes de mergear (demasiado grande, sin tests, mensaje horrible, mezcla de cosas, etc.).