# ============================================================================
# VectorVault-AI — Docker Image for Google Cloud Run
# Base: python:3.11-slim  |  Target RAM: 2 GB
# ============================================================================

FROM python:3.11-slim

# Install system deps required by ChromaDB (hnswlib) and PyMuPDF
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        g++ \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ .

# Create runtime directories
RUN mkdir -p uploads db

# Expose port 8080 (GCR convention)
EXPOSE 8080

# Preload the embedding model at build time to avoid cold-start download
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
