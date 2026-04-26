
    let currentStatus = '';
    let currentSources = []; // all sources active by default
    let items = [];
    const API = '/api';

    async function fetchJSON(url, opts = {}) {
      const res = await fetch(url, opts);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      return res.json();
    }

    // ─── Data ──────────────────────────────────
    async function loadStats() {
      try {
        const stats = await fetchJSON(`${API}/items/stats`);
        document.getElementById('stat-total').textContent = stats.total;
        document.getElementById('stat-new').textContent = stats.new;
        document.getElementById('stat-approved').textContent = stats.approved;
        document.getElementById('stat-skipped').textContent = stats.skipped;
        document.getElementById('stat-pending').textContent = stats.pending;
      } catch (err) {
        console.error('Failed to load stats:', err);
      }
    }

    async function loadItems(status = '') {
      const listEl = document.getElementById('items-list');
      listEl.innerHTML = '<div class="loading-skeleton"></div>'.repeat(3);

      try {
        const params = new URLSearchParams({ limit: '100' });
        if (status) params.set('status', status);
        if (currentSources.length > 0) params.set('source', currentSources.join(','));

        const data = await fetchJSON(`${API}/items?${params}`);
        items = data.items;
        renderItems(items);
      } catch (err) {
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="icon">⚠️</div>
            <p>Failed to load: ${err.message}</p>
          </div>`;
      }
    }

    // ─── Render ─────────────────────────────────
    function renderItems(items) {
      const listEl = document.getElementById('items-list');

      if (items.length === 0) {
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="icon">📭</div>
            <p>No posts yet. Click <strong>🚀 Fetch Posts</strong> to load content.</p>
          </div>`;
        return;
      }

      listEl.innerHTML = items.map((item) => {
        const title = escapeHtml(item.metadata?.title || item.content?.slice(0, 80) || 'Untitled');
        const url = item.metadata?.url || '';
        const threadUrl = item.metadata?.threadUrl || url; // Fallback to url if threadUrl is missing
        const author = item.metadata?.author || '';
        const score = item.metadata?.score || '';
        
        // Only show external link if it's actually different from the platform thread
        const hasExternalLink = url && url !== threadUrl;

        return `
        <div class="item-card" id="card-${item.id}">
          <div class="item-title">
            <a href="${escapeHtml(threadUrl)}" target="_blank" rel="noopener">
              ${title} <span class="thread-hint">on ${item.source.toUpperCase()}</span> ↗
            </a>
          </div>

          <div class="item-meta">
            <span class="tag tag-source">${escapeHtml(item.source)}</span>
            <span class="tag tag-type">${escapeHtml(item.type)}</span>
            ${author ? `<span class="tag-link">by <strong>${escapeHtml(author)}</strong></span>` : ''}
            ${score ? `<span class="tag-link">⬆ ${score}</span>` : ''}
            ${hasExternalLink ? `<span class="tag-link"><a href="${escapeHtml(url)}" target="_blank">Open link ↗</a></span>` : ''}
          </div>

          <div class="item-content ${item.content && item.content.length > 250 ? 'collapsed' : ''}" id="content-${item.id}">${escapeHtml(item.content)}</div>
          ${item.content && item.content.length > 250 ? `<button class="btn read-more-btn" data-action="toggle-content" data-id="${item.id}">👀 Показати більше</button>` : ''}
          ${item.response ? `
            <div class="ai-box">
              <div class="ai-label">🤖 AI Generated Comment</div>
              <div class="ai-text" id="response-${item.id}">${escapeHtml(item.response)}</div>
            </div>
          ` : `<div id="ai-container-${item.id}"></div>`}

          <div class="item-actions">
            ${!item.response ? `
              <button class="btn btn-generate" id="gen-${item.id}" data-action="generate" data-id="${item.id}">✨ Generate Comment</button>
            ` : `
              <button class="btn btn-copy" id="copy-${item.id}" data-action="copy" data-id="${item.id}">📋 Copy Comment</button>
              <button class="btn btn-generate" id="gen-${item.id}" data-action="generate" data-id="${item.id}">🔄 Regenerate</button>
            `}
            <button class="btn" data-action="skip" data-id="${item.id}">✕ Skip</button>
          </div>
        </div>`;
      }).join('');
    }

    function escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // ─── Generate Comment (on-demand AI) ───────
    async function generateComment(id) {
      const btn = document.getElementById(`gen-${id}`);
      const origText = btn.innerHTML;
      btn.innerHTML = '⏳ Generating...';
      btn.disabled = true;

      try {
        const data = await fetchJSON(`${API}/items/${id}/generate`, { method: 'POST' });

        // Show the AI response box
        const container = document.getElementById(`ai-container-${id}`);
        const existingBox = document.querySelector(`#card-${id} .ai-box`);

        const html = `
          <div class="ai-box">
            <div class="ai-label">🤖 AI Generated Comment</div>
            <div class="ai-text" id="response-${id}">${escapeHtml(data.comment)}</div>
          </div>`;

        if (existingBox) {
          existingBox.outerHTML = html;
        } else if (container) {
          container.innerHTML = html;
        }

        // Update button to copy
        btn.innerHTML = '🔄 Regenerate';
        btn.disabled = false;

        // Add copy button if not present
        const actionsDiv = btn.parentElement;
        if (!document.getElementById(`copy-${id}`)) {
          const copyBtn = document.createElement('button');
          copyBtn.className = 'btn btn-copy';
          copyBtn.id = `copy-${id}`;
          copyBtn.innerHTML = '📋 Copy Comment';
          copyBtn.dataset.action = 'copy';
          copyBtn.dataset.id = id;
          actionsDiv.insertBefore(copyBtn, btn);
        }

        // Update the item in local array
        const item = items.find(i => i.id === id);
        if (item) item.response = data.comment;

        showToast('Comment generated! ✓');
        loadStats();
      } catch (err) {
        showToast(`Generation failed: ${err.message}`);
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }

    // ─── Actions ───────────────────────────────
    async function skipItem(id) {
      try {
        await fetchJSON(`${API}/items/${id}/skip`, { method: 'POST' });
        showToast('Item skipped');
        await refresh();
      } catch (err) {
        showToast(`Error: ${err.message}`);
      }
    }

    async function copyResponse(id) {
      const item = items.find((i) => i.id === id);
      if (!item?.response) return;

      try {
        await navigator.clipboard.writeText(item.response);
        const btn = document.getElementById(`copy-${id}`);
        if (btn) {
          btn.classList.add('copied');
          btn.innerHTML = '✓ Copied!';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = '📋 Copy Comment';
          }, 2000);
        }
      } catch (err) {
        showToast('Copy failed');
      }
    }

    // ─── Filters ───────────────────────────────
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentStatus = btn.dataset.status;
        loadItems(currentStatus);
      });
    });

    // ─── Sync (Fetch Posts) ────────────────────
    document.getElementById('btn-sync').addEventListener('click', async () => {
      const btn = document.getElementById('btn-sync');
      btn.textContent = '⏳ Fetching...';
      btn.disabled = true;

      try {
        await fetchJSON(`${API}/sync`, { method: 'POST' });
        showToast('Fetching posts... will refresh in 10s');
        setTimeout(async () => {
          await refresh();
          btn.textContent = '🚀 Fetch Posts';
          btn.disabled = false;
        }, 10000);
      } catch (err) {
        showToast(`Error: ${err.message}`);
        btn.textContent = '🚀 Fetch Posts';
        btn.disabled = false;
      }
    });

    // ─── Refresh ───────────────────────────────
    async function refresh() {
      const btn = document.getElementById('btn-refresh');
      btn.classList.add('loading');
      await Promise.all([loadStats(), loadItems(currentStatus)]);
      btn.classList.remove('loading');
    }

    document.getElementById('btn-refresh').addEventListener('click', refresh);

    // ─── Toast ─────────────────────────────────
    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show', 'success');
      setTimeout(() => toast.classList.remove('show', 'success'), 3000);
    }

    // ─── Health ─────────────────────────────────
    async function checkHealth() {
      try {
        const data = await fetchJSON(`${API}/health`);
        const badge = document.getElementById('status-badge');
        badge.innerHTML = `<span class="dot"></span> ${data.db === 'connected' ? 'Online' : 'DB Down'}`;
      } catch (_) {
        const badge = document.getElementById('status-badge');
        badge.className = 'status-badge';
        badge.innerHTML = '⚠ Offline';
        badge.style.background = 'var(--danger-bg)';
        badge.style.color = 'var(--danger)';
      }
    }

    // ─── Event Delegation ──────────────────────
    document.getElementById('items-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn'); // Знаходимо найближчу кнопку (на випадок натискання на емодзі/іконку)
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (!action || !id) return;

      if (action === 'generate') generateComment(id);
      if (action === 'skip') skipItem(id);
      if (action === 'copy') copyResponse(id);
      
      if (action === 'toggle-content') {
        const contentEl = document.getElementById(`content-${id}`);
        if (contentEl.classList.contains('collapsed')) {
          contentEl.classList.remove('collapsed');
          btn.innerHTML = '⬆ Згорнути';
          contentEl.style.webkitMaskImage = 'none';
        } else {
          contentEl.classList.add('collapsed');
          btn.innerHTML = '👀 Показати більше';
          contentEl.style.webkitMaskImage = 'linear-gradient(180deg, #000 50%, transparent)';
        }
      }
    });


    // ─── Source Filters ─────────────────────────
    async function loadSources() {
      try {
        const data = await fetchJSON(`${API}/sources`);
        const container = document.getElementById('source-filters');
        const allSources = data.sources || [];

        // By default all sources are active
        currentSources = [...allSources];

        // Render checkboxes
        allSources.forEach((name) => {
          const label = document.createElement('label');
          label.className = 'source-check';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = true;
          checkbox.dataset.source = name;

          checkbox.addEventListener('change', () => {
            // Rebuild currentSources from checked boxes
            const checked = container.querySelectorAll('input[type="checkbox"]:checked');
            currentSources = [...checked].map((cb) => cb.dataset.source);
            loadItems(currentStatus);
          });

          const span = document.createElement('span');
          span.textContent = name.toUpperCase();

          label.appendChild(checkbox);
          label.appendChild(span);
          container.appendChild(label);
        });
      } catch (err) {
        console.error('Failed to load sources:', err);
      }
    }

    // ─── Upload Resumes ────────────────────────
    document.getElementById('file-upload').addEventListener('change', async (e) => {
      const files = e.target.files;
      if (files.length === 0) return;

      const btn = document.getElementById('btn-upload');
      const originalText = btn.innerHTML;
      btn.innerHTML = '⏳ Uploading...';
      btn.disabled = true;

      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }

      try {
        const res = await fetch(`${API}/upload`, {
          method: 'POST',
          body: formData
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
        
        showToast(`Uploaded! Processed: ${data.processed}, Failed: ${data.failed}`);
        e.target.value = ''; // Reset
        await refresh();
      } catch (err) {
        showToast(`Error: ${err.message}`);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });

    // ─── Init ──────────────────────────────────
    checkHealth();
    loadSources();
    refresh();
    // setInterval(refresh, 30000);