"""
VectorVault-AI — Semantic Search Engine
Handles PDF ingestion, text chunking, embedding generation, and ChromaDB vector storage/querying.
"""

import os
import uuid
import fitz  # PyMuPDF
import numpy as np
import chromadb
from sentence_transformers import SentenceTransformer
from sklearn.decomposition import PCA
from chromadb.config import Settings

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DB_DIR = os.path.join(os.path.dirname(__file__), "db")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
CHUNK_SIZE = 500          # characters per chunk
CHUNK_OVERLAP = 50        # overlap between consecutive chunks
COLLECTION_NAME = "vault_docs"

os.makedirs(DB_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Singleton helpers
# ---------------------------------------------------------------------------
_model: SentenceTransformer | None = None
_client: chromadb.ClientAPI | None = None


def get_model() -> SentenceTransformer:
    """Lazily load the embedding model once."""
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def get_chroma_client() -> chromadb.ClientAPI:
    """Return a persistent ChromaDB client."""
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=DB_DIR)
    return _client


def get_collection():
    """Get (or create) the default document collection."""
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


# ---------------------------------------------------------------------------
# PDF Processing
# ---------------------------------------------------------------------------

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract full text from a PDF using PyMuPDF."""
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks of roughly *chunk_size* characters."""
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += chunk_size - overlap
    return chunks


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

def ingest_pdf(pdf_path: str, filename: str) -> dict:
    """
    Full ingestion pipeline:
    1. Extract text from the PDF.
    2. Chunk the text.
    3. Generate embeddings.
    4. Store in ChromaDB with metadata.

    Returns a summary dict.
    """
    raw_text = extract_text_from_pdf(pdf_path)
    if not raw_text.strip():
        return {"status": "error", "message": "No text could be extracted from the PDF."}

    chunks = chunk_text(raw_text)
    model = get_model()
    embeddings = model.encode(chunks).tolist()

    collection = get_collection()
    ids = [str(uuid.uuid4()) for _ in chunks]
    metadatas = [
        {"source": filename, "chunk_index": i, "total_chunks": len(chunks)}
        for i in range(len(chunks))
    ]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas,
    )

    return {
        "status": "success",
        "filename": filename,
        "chunks_created": len(chunks),
        "total_characters": len(raw_text),
    }


# ---------------------------------------------------------------------------
# Querying
# ---------------------------------------------------------------------------

def semantic_search(query: str, top_k: int = 5) -> list[dict]:
    """
    Vectorize *query* and return the top-k most semantically similar chunks
    stored in ChromaDB.
    """
    model = get_model()
    query_embedding = model.encode([query]).tolist()

    collection = get_collection()
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    matches: list[dict] = []
    if results and results["documents"]:
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            matches.append({
                "text": doc,
                "source": meta.get("source", "unknown"),
                "chunk_index": meta.get("chunk_index", -1),
                "similarity": round(1 - dist, 4),  # cosine distance → similarity
            })
    return matches


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def get_vault_stats() -> dict:
    """Return basic stats about the current vault."""
    collection = get_collection()
    count = collection.count()
    return {"total_chunks": count, "collection": COLLECTION_NAME}


def get_unique_sources() -> list[dict]:
    """
    Query ChromaDB for all stored metadata and return a deduplicated
    list of source documents with their chunk counts.
    Survives page refreshes / cold starts since it reads from persistent storage.
    """
    collection = get_collection()
    count = collection.count()
    if count == 0:
        return []

    all_data = collection.get(include=["metadatas"])
    metadatas = all_data["metadatas"]

    # Count chunks per source file
    source_counts: dict[str, int] = {}
    for meta in metadatas:
        src = meta.get("source", "unknown")
        source_counts[src] = source_counts.get(src, 0) + 1

    return [
        {"name": name, "chunks": chunks}
        for name, chunks in sorted(source_counts.items())
    ]


def get_visualization_data() -> list[dict]:
    """
    Retrieve all stored embeddings, reduce them to 2D via PCA,
    and return a list of points for the Knowledge Map scatter plot.
    Each point contains: x, y, text (truncated), and source filename.
    """
    collection = get_collection()
    count = collection.count()
    if count < 2:
        # PCA needs at least 2 samples
        return []

    # Fetch everything from ChromaDB
    all_data = collection.get(
        include=["embeddings", "documents", "metadatas"],
    )

    embeddings = np.array(all_data["embeddings"])
    documents = all_data["documents"]
    metadatas = all_data["metadatas"]

    # PCA → 2 dimensions
    pca = PCA(n_components=2)
    coords = pca.fit_transform(embeddings)

    points: list[dict] = []
    for i in range(len(documents)):
        snippet = documents[i][:120] + ("…" if len(documents[i]) > 120 else "")
        points.append({
            "x": round(float(coords[i, 0]), 6),
            "y": round(float(coords[i, 1]), 6),
            "text": snippet,
            "source": metadatas[i].get("source", "unknown"),
        })

    return points

