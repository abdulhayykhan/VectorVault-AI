/**
 * VectorVault-AI — Frontend Controller
 * Handles file upload, semantic search, theme toggle, and knowledge map.
 */
document.addEventListener('DOMContentLoaded', () => {

  // ── DOM References ──────────────────────────────────────────────────────────
  const uploadZone     = document.getElementById('upload-zone');
  const fileInput      = document.getElementById('file-input');
  const uploadProg     = document.getElementById('upload-progress');
  const progressFill   = document.getElementById('progress-fill');
  const uploadStatus   = document.getElementById('upload-status');
  const fileList       = document.getElementById('file-list');
  const searchInput    = document.getElementById('search-input');
  const searchBtn      = document.getElementById('search-btn');
  const resultsFeed    = document.getElementById('results-feed');
  const resultsLabel   = document.getElementById('results-label');
  const loadingSpinner = document.getElementById('loading-spinner');
  const emptyState     = document.getElementById('empty-state');
  const toastContainer = document.getElementById('toast-container');
  const statDocs       = document.getElementById('stat-docs');
  const statVectors    = document.getElementById('stat-vectors');
  const themeToggle    = document.getElementById('theme-toggle');
  const themeIcon      = document.getElementById('theme-icon');
  const mapContainer   = document.getElementById('map-container');
  const mapCanvas      = document.getElementById('knowledge-map-canvas');
  const mapTooltip     = document.getElementById('map-tooltip');
  const mapEmpty       = document.getElementById('map-empty');
  const mapLoading     = document.getElementById('map-loading');
  const mapLabel       = document.getElementById('map-label');
  const mapRefreshBtn  = document.getElementById('map-refresh-btn');

  // ── State ─────────────────────────────────────────────────────────────────
  let uploadedFiles  = [];
  let knowledgeChart = null;
  let mapPointsCache = [];

  // ── Theme Toggle ──────────────────────────────────────────────────────────
  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      themeIcon.textContent = '☀️';
    } else {
      document.body.classList.remove('light-theme');
      themeIcon.textContent = '🌙';
    }
    // Update Chart.js colors if the knowledge map is rendered
    if (knowledgeChart) {
      const labelColor = theme === 'light' ? 'rgba(26,26,46,0.6)'  : 'rgba(240,240,248,0.7)';
      const tickColor  = theme === 'light' ? 'rgba(26,26,46,0.4)'  : 'rgba(240,240,248,0.3)';
      const gridColor  = theme === 'light' ? 'rgba(0,0,0,0.05)'    : 'rgba(255,255,255,0.04)';
      knowledgeChart.options.plugins.legend.labels.color = labelColor;
      knowledgeChart.options.scales.x.ticks.color = tickColor;
      knowledgeChart.options.scales.y.ticks.color = tickColor;
      knowledgeChart.options.scales.x.grid.color  = gridColor;
      knowledgeChart.options.scales.y.grid.color  = gridColor;
      knowledgeChart.update('none');
    }
  }

  const savedTheme = localStorage.getItem('vv-theme') || 'dark';
  applyTheme(savedTheme);

  themeToggle.addEventListener('click', () => {
    const isLight = document.body.classList.contains('light-theme');
    const newTheme = isLight ? 'dark' : 'light';
    localStorage.setItem('vv-theme', newTheme);
    applyTheme(newTheme);
  });

  // ── Utilities ─────────────────────────────────────────────────────────────
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span><span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function setProgress(percent, text) {
    uploadProg.classList.add('active');
    progressFill.style.width = percent + '%';
    uploadStatus.textContent = text;
  }

  function hideProgress() {
    setTimeout(() => {
      uploadProg.classList.remove('active');
      progressFill.style.width = '0%';
    }, 1500);
  }

  function scoreClass(similarity) {
    if (similarity >= 0.7) return 'high';
    if (similarity >= 0.4) return 'mid';
    return 'low';
  }

  function truncate(str, len = 300) {
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

  // ── Fetch Vault Stats ─────────────────────────────────────────────────────
  async function refreshStats() {
    try {
      const [statsRes, sourcesRes] = await Promise.all([
        fetch('/stats'),
        fetch('/sources'),
      ]);
      const stats   = await statsRes.json();
      const sources = await sourcesRes.json();

      // Update vector count from ChromaDB
      statVectors.textContent = stats.total_chunks.toLocaleString();

      // Update doc count from persistent source list
      statDocs.textContent = sources.total_docs;

      // Rebuild uploadedFiles from backend so file-list survives refresh
      // Merge: keep any session-uploaded entries, add any from DB not yet tracked
      const trackedNames = new Set(uploadedFiles.map(f => f.name));
      for (const src of sources.sources) {
        if (!trackedNames.has(src.name)) {
          uploadedFiles.push({ name: src.name, chunks: src.chunks, chars: 0 });
        }
      }

      renderFileList();
    } catch {
      // silent fail on stats
    }
  }

  // ── File Upload ───────────────────────────────────────────────────────────
  // Click anywhere in the upload zone → open file picker
  uploadZone.addEventListener('click', () => fileInput.click());

  // Prevent the hidden input's own click from bubbling back up to the zone
  fileInput.addEventListener('click', (e) => e.stopPropagation());

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const files = [...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (files.length) handleMultiUpload(files);
    else showToast('Only PDF files are accepted.', 'error');
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleMultiUpload([...fileInput.files]);
  });

  /**
   * Upload a single PDF file. Returns the response data or throws.
   */
  async function uploadSinglePdf(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      throw new Error(`${file.name} is not a PDF.`);
    }
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Failed: ${file.name}`);
    }
    return res.json();
  }

  /**
   * Handle uploading one or more PDFs in parallel.
   * Shows unified progress and a single "Finished" state.
   */
  async function handleMultiUpload(files) {
    const total = files.length;
    setProgress(5, `Uploading ${total} file${total > 1 ? 's' : ''}...`);

    const promises = files.map((file, i) =>
      uploadSinglePdf(file).then(data => {
        const pct = Math.round(((i + 1) / total) * 90) + 10;
        setProgress(pct, `Processing ${i + 1}/${total}: ${file.name}`);
        return { status: 'ok', data, file };
      }).catch(err => {
        return { status: 'fail', error: err.message, file };
      })
    );

    const results = await Promise.all(promises);

    let successCount = 0;
    let totalChunks  = 0;

    for (const r of results) {
      if (r.status === 'ok') {
        successCount++;
        totalChunks += r.data.chunks_created;
        uploadedFiles.push({
          name:   r.data.filename,
          chunks: r.data.chunks_created,
          chars:  r.data.total_characters,
        });
      } else {
        showToast(r.error, 'error');
      }
    }

    if (successCount > 0) {
      setProgress(100, `✓ ${successCount} file${successCount > 1 ? 's' : ''} indexed — ${totalChunks} chunks total`);
      renderFileList();
      refreshStats();
      refreshMap();
      showToast(
        `${successCount}/${total} file${total > 1 ? 's' : ''} indexed — ${totalChunks} vectors created`,
        successCount === total ? 'success' : 'info'
      );
    } else {
      setProgress(0, '');
    }

    hideProgress();
    fileInput.value = '';
  }

  function renderFileList() {
    fileList.innerHTML = uploadedFiles.map(f => `
      <div class="file-item">
        <span class="file-item__icon">📄</span>
        <span class="file-item__name">${f.name}</span>
        <span class="file-item__badge">${f.chunks} chunks</span>
      </div>
    `).join('');
  }

  // ── Semantic Search ───────────────────────────────────────────────────────
  searchBtn.addEventListener('click', executeSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') executeSearch(); });

  async function executeSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      showToast('Enter a search query first.', 'error');
      return;
    }

    emptyState.style.display = 'none';
    resultsFeed.innerHTML = '';
    loadingSpinner.classList.add('active');
    resultsLabel.textContent = 'Searching...';

    try {
      const res = await fetch('/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, top_k: 5 }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Search failed');
      }

      const data = await res.json();
      loadingSpinner.classList.remove('active');

      if (!data.results.length) {
        resultsLabel.textContent = 'No matches found';
        resultsFeed.innerHTML = `
          <div class="empty-state">
            <div class="empty-state__icon">🔍</div>
            <div class="empty-state__text">No semantic matches found. Try uploading more documents.</div>
          </div>`;
        return;
      }

      resultsLabel.textContent = `${data.total_results} matches for "${truncate(query, 40)}"`;
      renderResults(data.results);
    } catch (err) {
      loadingSpinner.classList.remove('active');
      resultsLabel.textContent = 'Error';
      showToast(err.message, 'error');
    }
  }

  function renderResults(results) {
    resultsFeed.innerHTML = results.map((r, i) => `
      <div class="result-card" style="animation-delay: ${i * 0.08}s">
        <div class="result-card__meta">
          <span class="result-card__source">📄 ${r.source}</span>
          <span class="result-card__score result-card__score--${scoreClass(r.similarity)}">
            ${(r.similarity * 100).toFixed(1)}% match
          </span>
        </div>
        <div class="result-card__text">${truncate(r.text)}</div>
        <div class="result-card__chunk">Chunk #${r.chunk_index}</div>
      </div>
    `).join('');
  }

  // ── Knowledge Map ─────────────────────────────────────────────────────────
  const MAP_COLORS = [
    'rgba(124, 92, 252, 0.85)',   // accent purple
    'rgba(34, 211, 238, 0.85)',   // cyan
    'rgba(52, 211, 153, 0.85)',   // emerald
    'rgba(251, 113, 133, 0.85)',  // rose
    'rgba(251, 191, 36, 0.85)',   // amber
    'rgba(139, 92, 246, 0.85)',   // violet
    'rgba(59, 130, 246, 0.85)',   // blue
    'rgba(236, 72, 153, 0.85)',   // pink
    'rgba(16, 185, 129, 0.85)',   // green
    'rgba(245, 158, 11, 0.85)',   // orange
  ];

  function getSourceColor(source, sourceList) {
    const idx = sourceList.indexOf(source);
    return MAP_COLORS[idx % MAP_COLORS.length];
  }

  mapRefreshBtn.addEventListener('click', refreshMap);

  async function refreshMap() {
    mapLoading.classList.add('active');
    mapEmpty.classList.remove('active');
    mapContainer.classList.remove('hidden');

    try {
      const res  = await fetch('/visualize');
      const data = await res.json();
      mapLoading.classList.remove('active');

      if (!data.points || data.points.length < 2) {
        mapContainer.classList.add('hidden');
        mapEmpty.classList.add('active');
        mapLabel.textContent = 'Needs at least 2 document chunks';
        return;
      }

      mapPointsCache = data.points;
      mapLabel.textContent = `${data.total} vectors projected to 2D via PCA`;
      renderKnowledgeMap(data.points);
    } catch (err) {
      mapLoading.classList.remove('active');
      mapContainer.classList.add('hidden');
      mapEmpty.classList.add('active');
      showToast('Failed to load Knowledge Map', 'error');
    }
  }

  function renderKnowledgeMap(points) {
    const uniqueSources = [...new Set(points.map(p => p.source))];

    const datasets = uniqueSources.map((source) => {
      const color = getSourceColor(source, uniqueSources);
      const sourcePoints = points
        .map((p, idx) => (p.source === source ? { x: p.x, y: p.y, _idx: idx } : null))
        .filter(Boolean);

      return {
        label: source,
        data: sourcePoints,
        backgroundColor: color,
        borderColor: color.replace('0.85', '1'),
        borderWidth: 1,
        pointRadius: 6,
        pointHoverRadius: 10,
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: '#fff',
      };
    });

    // Destroy old chart instance before creating a new one
    if (knowledgeChart) {
      knowledgeChart.destroy();
      knowledgeChart = null;
    }

    const ctx = mapCanvas.getContext('2d');
    knowledgeChart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: 'rgba(240, 240, 248, 0.7)',
              font: { family: "'Inter', sans-serif", size: 11 },
              padding: 16,
              usePointStyle: true,
              pointStyleWidth: 10,
            },
          },
          tooltip: { enabled: false },
        },
        scales: {
          x: {
            title: { display: true, text: 'PC 1', color: 'rgba(240,240,248,0.35)', font: { size: 11 } },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: 'rgba(240,240,248,0.3)', font: { size: 10 } },
            border:{ color: 'rgba(255,255,255,0.06)' },
          },
          y: {
            title: { display: true, text: 'PC 2', color: 'rgba(240,240,248,0.35)', font: { size: 11 } },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: 'rgba(240,240,248,0.3)', font: { size: 10 } },
            border:{ color: 'rgba(255,255,255,0.06)' },
          },
        },
        onHover: (event, elements) => {
          mapCanvas.style.cursor = elements.length ? 'pointer' : 'default';
        },
      },
    });

    // Custom tooltip on hover
    mapCanvas.addEventListener('mousemove', (e) => {
      const els = knowledgeChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
      if (els.length) {
        const el = els[0];
        const dataPoint = knowledgeChart.data.datasets[el.datasetIndex].data[el.index];
        const point = mapPointsCache[dataPoint._idx];
        mapTooltip.innerHTML = `
          <div class="map-tooltip__source">📄 ${point.source}</div>
          <div class="map-tooltip__text">${point.text}</div>
        `;
        const rect = mapContainer.getBoundingClientRect();
        let left = e.clientX - rect.left + 14;
        let top  = e.clientY - rect.top - 10;
        if (left + 320 > rect.width) left = left - 340;
        if (top + 100 > rect.height) top  = rect.height - 120;
        mapTooltip.style.left = left + 'px';
        mapTooltip.style.top  = top + 'px';
        mapTooltip.classList.add('active');
      } else {
        mapTooltip.classList.remove('active');
      }
    });

    mapCanvas.addEventListener('mouseleave', () => {
      mapTooltip.classList.remove('active');
    });

    // Click a dot → show snippet in a toast
    mapCanvas.addEventListener('click', (e) => {
      const els = knowledgeChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
      if (els.length) {
        const el = els[0];
        const dataPoint = knowledgeChart.data.datasets[el.datasetIndex].data[el.index];
        const point = mapPointsCache[dataPoint._idx];
        showToast(`[${point.source}] ${point.text}`, 'info');
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  refreshStats();
  refreshMap();

}); // end DOMContentLoaded
