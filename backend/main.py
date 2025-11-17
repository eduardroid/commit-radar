# main.py
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List, Literal, Dict, Any

from analyzer import analyze_commit

app = FastAPI(
    title="CommitCoach API",
    version="0.1.0",
    description="API para analizar commits y devolver CommitScore™ + sugerencias",
)


# ---------- Esquemas de request/response ----------

class CommitAnalysisRequest(BaseModel):
    diff: str
    message: str
    repo_name: Optional[str] = ""


class CommitScore(BaseModel):
    value: int
    label: Literal["Green", "Yellow", "Red"]


class CommitAnalysisResponse(BaseModel):
    commitScore: CommitScore
    flags: List[str]
    suggestions: List[str]
    suggestedMessage: str


# ---------- Endpoints ----------

@app.get("/health")
def healthcheck() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=CommitAnalysisResponse)
def analyze_endpoint(payload: CommitAnalysisRequest) -> Any:
    """
    Endpoint principal de CommitCoach.
    Recibe diff + message (+ repo_name opcional) y devuelve el JSON del analyzer.
    """
    result = analyze_commit(
        diff=payload.diff,
        message=payload.message,
        repo_name=payload.repo_name or "",
    )

    # `analyze_commit` ya devuelve un dict con:
    # {
    #   "commitScore": { "value": int, "label": "Green|Yellow|Red" },
    #   "flags": [...],
    #   "suggestions": [...],
    #   "suggestedMessage": "..."
    # }
    #
    # FastAPI se encarga de validarlo contra CommitAnalysisResponse
    # y convertirlo a JSON.
    return result


@app.get("/")
def root() -> Dict[str, str]:
    return {
        "message": "CommitCoach API",
        "docs": "/docs",
        "health": "/health",
        "analyze": "/analyze",
    }
