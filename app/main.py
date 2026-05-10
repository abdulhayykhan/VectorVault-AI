"""
VectorVault-AI — FastAPI Application
"""

import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from engine import ingest_pdf, semantic_search, get_vault_stats, get_unique_sources, get_visualization_data, UPLOAD_DIR

app = FastAPI(title="VectorVault-AI", version="1.0.0")

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class QueryRequest(BaseModel):
    query: str
    top_k: int = 5


class QueryResult(BaseModel):
    text: str
    source: str
    chunk_index: int
    similarity: float


class QueryResponse(BaseModel):
    query: str
    results: list[QueryResult]
    total_results: int


class UploadResponse(BaseModel):
    status: str
    filename: str | None = None
    chunks_created: int | None = None
    total_characters: int | None = None
    message: str | None = None


class VaultStats(BaseModel):
    total_chunks: int
    collection: str


@app.get("/", include_in_schema=False)
async def serve_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.post("/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    save_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    result = ingest_pdf(save_path, file.filename)
    if result["status"] == "error":
        raise HTTPException(status_code=422, detail=result.get("message", "Processing failed."))

    return UploadResponse(**result)


@app.post("/query", response_model=QueryResponse)
async def query_vault(body: QueryRequest):
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")

    results = semantic_search(body.query, top_k=body.top_k)
    return QueryResponse(query=body.query, results=results, total_results=len(results))


@app.get("/stats", response_model=VaultStats)
async def vault_stats():
    return get_vault_stats()


@app.get("/sources")
async def list_sources():
    """Return unique source documents persisted in ChromaDB."""
    sources = get_unique_sources()
    return {"sources": sources, "total_docs": len(sources)}


@app.get("/visualize")
async def visualize():
    """Return PCA-projected 2D coordinates for the Knowledge Map."""
    points = get_visualization_data()
    return {"points": points, "total": len(points)}

