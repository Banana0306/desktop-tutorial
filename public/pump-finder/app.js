const state = {
  pumps: [],
  compareIds: [],
  editMode: false,
  loggedIn: false,
};

const els = {
  keyword: document.getElementById('keyword'),
  filterBrand: document.getElementById('filterBrand'),
  clearBtn: document.getElementById('clearBtn'),
  results: document.getElementById('results'),
  resultCount: document.getElementById('resultCount'),
  emptyState: document.getElementById('emptyState'),
  compareTray: document.getElementById('compareTray'),
  compareCount: document.getElementById('compareCount'),
  compareList: document.getElementById('compareList'),
  compareClear: document.getElementById('compareClear'),
  detailModal: document.getElementById('detailModal'),
  detailModalCard: document.getElementById('detailModalCard'),
  authStatus: document.getElementById('authStatus'),
  editModeBtn: document.getElementById('editModeBtn'),
  exportBtn: document.getElementById('exportBtn'),
  addBtn: document.getElementById('addBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),
  editModal: document.getElementById('editModal'),
  editModalCard: document.getElementById('editModalCard'),
};

const MAX_COMPARE = 3;

init();

async function init() {
  const res = await fetch('data.json');
  state.pumps = await res.json();

  populateFilterOptions();
  await checkAuth();
  render();

  els.keyword.addEventListener('input', render);
  els.filterBrand.addEventListener('change', render);
  els.clearBtn.addEventListener('click', () => {
    els.keyword.value = '';
    els.filterBrand.value = '';
    render();
  });
  els.compareClear.addEventListener('click', () => {
    state.compareIds = [];
    render();
  });
  els.detailModal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  els.editModal.querySelector('.modal-backdrop').addEventListener('click', closeEditModal);

  els.editModeBtn.addEventListener('click', () => {
    state.editMode = !state.editMode;
    els.editModeBtn.classList.toggle('active', state.editMode);
    els.addBtn.hidden = !state.editMode;
    els.importBtn.hidden = !state.editMode;
    render();
  });
  els.addBtn.addEventListener('click', () => openEditModal(null));
  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', handleImportFile);
}

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.status === 404) {
      // No backend (e.g. static GitHub Pages hosting) — read-only viewer only.
      els.exportBtn.hidden = true;
      return;
    }
    if (res.ok) {
      const data = await res.json();
      state.loggedIn = true;
      els.authStatus.innerHTML = `已登入：${data.username}`;
      els.editModeBtn.hidden = false;
    } else {
      state.loggedIn = false;
      els.authStatus.innerHTML = '<a href="/login.html">登入以編輯資料</a>';
      els.editModeBtn.hidden = true;
    }
  } catch {
    state.loggedIn = false;
  }
}

function populateFilterOptions() {
  els.filterBrand.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());
  const brands = [...new Set(state.pumps.map(p => p.brand))].sort();

  for (const b of brands) {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    els.filterBrand.appendChild(opt);
  }
}

function fmtPrice(price) {
  return price == null ? '價格未提供' : `NT$ ${price.toLocaleString()}`;
}

function matchesKeyword(pump, keyword) {
  if (!keyword) return true;
  const haystack = [
    pump.name, pump.oemCode, pump.brand, pump.notes,
    ...(pump.models || []),
  ].join(' ').toLowerCase();
  return haystack.includes(keyword.toLowerCase());
}

function getFiltered() {
  const keyword = els.keyword.value.trim();
  const brand = els.filterBrand.value;

  return state.pumps.filter(p =>
    matchesKeyword(p, keyword) &&
    (!brand || p.brand === brand)
  );
}

function render() {
  const filtered = getFiltered();

  els.resultCount.textContent = `符合 ${filtered.length} / ${state.pumps.length} 筆`;
  els.emptyState.hidden = filtered.length > 0;
  els.results.innerHTML = '';

  for (const pump of filtered) {
    els.results.appendChild(buildCard(pump));
  }

  renderCompareTray();
}

function buildCard(pump) {
  const card = document.createElement('div');
  card.className = 'pump-card';

  const inCompare = state.compareIds.includes(pump.id);

  card.innerHTML = `
    <img src="${escapeAttr(pump.imageUrl)}" alt="${escapeAttr(pump.name)}" loading="lazy">
    <div class="body">
      <h3>${escapeAttr(pump.name)}</h3>
      <span class="oem">${escapeAttr(pump.oemCode)}</span>
      <span class="models">適用：${escapeAttr((pump.models || []).join('、'))}</span>
      <span class="specs">${escapeAttr(pump.brand)}</span>
      <span class="price">${fmtPrice(pump.price)}</span>
      <div class="card-actions">
        <button type="button" data-action="detail">查看詳情</button>
        <button type="button" data-action="compare" class="${inCompare ? 'added' : ''}">
          ${inCompare ? '已加入比對' : '加入比對'}
        </button>
        ${state.editMode ? '<button type="button" data-action="edit">編輯</button>' : ''}
      </div>
    </div>
  `;

  card.querySelector('[data-action="detail"]').addEventListener('click', e => {
    e.stopPropagation();
    openModal(pump);
  });
  card.querySelector('[data-action="compare"]').addEventListener('click', e => {
    e.stopPropagation();
    toggleCompare(pump.id);
  });
  const editBtn = card.querySelector('[data-action="edit"]');
  if (editBtn) {
    editBtn.addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(pump);
    });
  }
  card.addEventListener('click', () => openModal(pump));

  return card;
}

function toggleCompare(id) {
  const idx = state.compareIds.indexOf(id);
  if (idx >= 0) {
    state.compareIds.splice(idx, 1);
  } else {
    if (state.compareIds.length >= MAX_COMPARE) {
      alert(`最多只能同時比對 ${MAX_COMPARE} 個機種`);
      return;
    }
    state.compareIds.push(id);
  }
  render();
}

function renderCompareTray() {
  els.compareCount.textContent = state.compareIds.length;
  els.compareTray.hidden = state.compareIds.length === 0;
  els.compareList.innerHTML = '';

  for (const id of state.compareIds) {
    const pump = state.pumps.find(p => p.id === id);
    if (!pump) continue;
    const item = document.createElement('div');
    item.className = 'compare-item';
    item.innerHTML = `
      <img src="${escapeAttr(pump.imageUrl)}" alt="${escapeAttr(pump.name)}">
      <span class="name">${escapeAttr(pump.name)}</span>
      <button type="button" aria-label="移除">✕</button>
    `;
    item.querySelector('button').addEventListener('click', () => toggleCompare(id));
    els.compareList.appendChild(item);
  }
}

function openModal(pump) {
  els.detailModalCard.innerHTML = `
    <button class="close-btn" type="button" aria-label="關閉">✕</button>
    <img src="${escapeAttr(pump.imageUrl)}" alt="${escapeAttr(pump.name)}">
    <h2>${escapeAttr(pump.name)}</h2>
    <span class="oem">OEM碼：${escapeAttr(pump.oemCode)}</span>
    <table>
      <tr><td>適用品牌</td><td>${escapeAttr(pump.brand)}</td></tr>
      <tr><td>適用車型</td><td>${escapeAttr((pump.models || []).join('、'))}</td></tr>
      <tr><td>參考售價</td><td>${fmtPrice(pump.price)}</td></tr>
      <tr><td>備註</td><td>${escapeAttr(pump.notes || '-')}</td></tr>
    </table>
  `;
  els.detailModalCard.querySelector('.close-btn').addEventListener('click', closeModal);
  els.detailModal.hidden = false;
}

function closeModal() {
  els.detailModal.hidden = true;
}

function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function openEditModal(pump) {
  const isNew = pump === null;
  const p = pump || { name: '', oemCode: '', brand: '', models: [], price: '', notes: '', imageUrl: '' };

  els.editModalCard.innerHTML = `
    <button class="close-btn" type="button" aria-label="關閉">✕</button>
    <h2>${isNew ? '新增機種' : '編輯機種'}</h2>
    <form class="edit-form">
      <label>名稱<input name="name" value="${escapeAttr(p.name)}" required></label>
      <label>OEM 碼<input name="oemCode" value="${escapeAttr(p.oemCode)}" required></label>
      <label>品牌<input name="brand" value="${escapeAttr(p.brand)}"></label>
      <label>適用車型（用、分隔）<input name="models" value="${escapeAttr((p.models || []).join('、'))}"></label>
      <label>參考售價（留空表示未提供）<input name="price" type="number" value="${p.price ?? ''}"></label>
      <label>圖片網址<input name="imageUrl" value="${escapeAttr(p.imageUrl)}" placeholder="images/placeholder.svg"></label>
      <label>備註<textarea name="notes" rows="2">${escapeAttr(p.notes)}</textarea></label>
      <div class="form-actions">
        ${isNew ? '' : '<button type="button" class="delete-btn">刪除</button>'}
        <button type="submit" class="save-btn">儲存</button>
      </div>
    </form>
  `;

  els.editModalCard.querySelector('.close-btn').addEventListener('click', closeEditModal);
  els.editModalCard.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    saveEditForm(e.target, isNew ? null : pump);
  });
  const deleteBtn = els.editModalCard.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deletePump(pump));
  }

  els.editModal.hidden = false;
}

function closeEditModal() {
  els.editModal.hidden = true;
}

async function saveEditForm(form, existingPump) {
  const data = new FormData(form);
  const priceRaw = data.get('price');

  const record = {
    ...(existingPump || {}),
    name: data.get('name').trim(),
    oemCode: data.get('oemCode').trim(),
    brand: data.get('brand').trim(),
    models: data.get('models').split('、').map(s => s.trim()).filter(Boolean),
    price: priceRaw === '' ? null : Number(priceRaw),
    notes: data.get('notes').trim(),
    imageUrl: data.get('imageUrl').trim() || 'images/placeholder.svg',
  };

  const pumps = [...state.pumps];
  if (existingPump) {
    pumps[pumps.findIndex(p => p.id === existingPump.id)] = record;
  } else {
    record.id = nextLocalId(pumps);
    record.yearRange = '-';
    record.displacement = '-';
    record.voltage = '12V';
    record.connectorType = '-';
    record.outletType = '-';
    record.mountingType = '-';
    record.color = '-';
    pumps.push(record);
  }

  const ok = await savePumps(pumps);
  if (ok) {
    closeEditModal();
  }
}

async function deletePump(pump) {
  if (!confirm(`確定要刪除「${pump.name}」嗎？`)) return;
  const pumps = state.pumps.filter(p => p.id !== pump.id);
  const ok = await savePumps(pumps);
  if (ok) {
    closeEditModal();
  }
}

function nextLocalId(pumps) {
  let max = 0;
  for (const p of pumps) {
    const m = /^FP-(\d+)$/.exec(p.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `FP-${String(max + 1).padStart(3, '0')}`;
}

async function savePumps(pumps) {
  try {
    const res = await fetch('/api/pump-finder/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pumps }),
    });
    if (res.status === 401) {
      alert('請先登入後台帳號再進行編輯');
      return false;
    }
    if (!res.ok) {
      alert('儲存失敗，請稍後再試');
      return false;
    }
    state.pumps = pumps;
    populateFilterOptions();
    render();
    return true;
  } catch {
    alert('儲存失敗，請檢查網路連線');
    return false;
  }
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/pump-finder/import', { method: 'POST', body: formData });
    if (res.status === 401) {
      alert('請先登入後台帳號再匯入資料');
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      alert(`匯入失敗：${data.error || '未知錯誤'}`);
      return;
    }
    state.pumps = data.pumps;
    populateFilterOptions();
    render();
    alert(`匯入完成，目前共 ${data.pumps.length} 筆資料`);
  } catch {
    alert('匯入失敗，請檢查網路連線');
  }
}
