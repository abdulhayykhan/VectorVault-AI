# VectorVault-AI

**VectorVault-AI** is a local-first semantic research and document exploration engine. Built for the **Artificial Intelligence** course in my **4th semester of BS Artificial Intelligence (DUET)**, it moves beyond traditional keyword searching to provide a "Neural Search" experience. It utilizes high-dimensional vector embeddings to understand the context and meaning of academic documents, offering advanced features like semantic clustering and automated knowledge mapping.

---

## Overview

The project demonstrates the application of modern AI retrieval systems: extracting text from unstructured PDFs, transforming language into mathematical vectors, and performing efficient similarity searches. By utilizing a local vector database and transformer models, **VectorVault-AI** ensures that all academic data remains private and is processed entirely on the user's machine, eliminating the need for expensive or privacy-invasive cloud APIs.

---

## Features

* **Neural Search Engine**: Semantic similarity search using Cosine Distance. Finds information based on concept even if exact keywords aren't present.
* **Automated Knowledge Map**: A 2D visualization of the "Document Landscape" using **Principal Component Analysis (PCA)** to project 384-dimensional embeddings onto a scatter plot.
* **Multi-Document Ingestion**: Supports drag-and-drop uploading of multiple PDFs simultaneously with parallel asynchronous processing.
* **Intelligent Chunking**: Automatically splits documents into 500-character segments with overlapping windows to preserve semantic context across boundaries.
* **Dynamic Theming**: Interactive Glassmorphism UI with a real-time Light/Dark mode toggle that persists across sessions.
* **Local-First Architecture**: Powered by local Sentence-Transformers and ChromaDB, ensuring zero data latency and 100% data privacy.

---

## Technologies Used

| Component | Purpose |
| --- | --- |
| Python / FastAPI | High-performance backend and API orchestration |
| Sentence-Transformers | Local embedding generation (`all-MiniLM-L6-v2`) |
| ChromaDB | Vector database for persistent embedding storage and retrieval |
| scikit-learn | Dimensionality reduction (PCA) for the Knowledge Map |
| PyMuPDF (fitz) | High-fidelity PDF text extraction |
| Chart.js | Interactive 2D scatter plot rendering for the map |
| HTML5 / CSS3 / JS | Custom Glassmorphism UI and asynchronous frontend logic |
| Docker | Containerization for reproducible local and cloud deployment |

---

## Project Structure

```
VectorVault-AI/
├── app/
│   ├── main.py          # FastAPI routes, file handling, and API logic
│   ├── engine.py        # AI logic: embedding, chunking, PCA, and ChromaDB ops
│   ├── static/          # Frontend assets (index.html, style.css, app.js)
│   ├── uploads/         # Temporary storage for ingested PDFs
│   └── db/              # Persistent ChromaDB vector storage
├── Dockerfile           # GCR-optimized container config
├── requirements.txt     # Python dependencies (pinned versions)
├── .gitignore           # Excludes venv, __pycache__, and local DB files
└── README.md            # Project documentation

```

---

## Installation and Setup

1. **Clone the repository**:
```bash
git clone [https://github.com/abdulhayykhan/VectorVault-AI.git](https://github.com/abdulhayykhan/VectorVault-AI.git)
cd VectorVault-AI

```


2. **Install C++ Build Tools** (Windows only):
Required for `chromadb` compilation. Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.
3. **Create and activate a virtualenv**:
```bash
python -m venv .venv
.venv\Scripts\activate  # Windows

```


4. **Install dependencies**:
```bash
pip install -r requirements.txt

```


5. **Run the development server**:
```bash
cd app
uvicorn main:app --reload --host 127.0.0.1 --port 8000

```



---

## Usage Guide

1. **Dashboard**: Access the UI at `http://127.0.0.1:8000`. Toggle the theme in the top right for your preferred environment.
2. **Ingestion**: Drop one or multiple PDF files into the "Document Vault" zone. Wait for the system to extract text and generate embeddings.
3. **Neural Search**: Type a concept-based question (e.g., "How do neural networks learn?") into the search bar.
4. **Explore the Map**: Switch to the Knowledge Map to see how the AI has clustered your documents. Hover over points to see text snippets from specific files.

---

## AI Concepts Illustrated

| Concept | Implementation in VectorVault-AI |
| --- | --- |
| **Vector Embeddings** | Transforming text into 384-dimensional numerical arrays representing "meaning." |
| **Semantic Similarity** | Using Cosine Distance to rank document segments by conceptual relevance to a query. |
| **Dimensionality Reduction** | Applying PCA to project high-dimensional data into a human-readable 2D space. |
| **RAG (Retrieval Logic)** | Creating a foundational pipeline for Retrieval-Augmented Generation without cloud dependencies. |
| **Unsupervised Clustering** | Visualizing how the AI naturally groups related lecture notes together without human labels. |

---

## Deployment (Google Cloud Run)

The project is configured for seamless deployment to GCR:

1. Build the image: `gcloud builds submit --tag gcr.io/[PROJECT_ID]/vectorvault-ai`
2. Deploy: `gcloud run deploy vectorvault-ai --image gcr.io/[PROJECT_ID]/vectorvault-ai --memory 2Gi --cpu 2`

---

## Author

[Abdul Hayy Khan](https://www.linkedin.com/in/abdulhayykhan/)

abdulhayykhan.1@gmail.com


---

## License

This project is open-source and available for educational use under the **MIT License**.