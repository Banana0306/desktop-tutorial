const state = {
  pumps: [],
  compareIds: [],
};

const els = {
  keyword: document.getElementById('keyword'),
  filterBrand: document.getElementById('filterBrand'),
  filterConnector: document.getElementById('filterConnector'),
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
};

const MAX_COMPARE = 3;

init();

async function init() {
  const res = await fetch('data.json');
  state.pumps = await res.json();

  populateFilterOptions();
  render();

  els.keyword.addEventListener('input', render);
  els.filterBrand.addEventListener('change', render);
  els.filterConnector.addEventListener('change', render);
  els.clearBtn.addEventListener('click', () => {
    els.keyword.value = '';
    els.filterBrand.value = '';
    els.filterConnector.value = '';
    render();
  });
  els.compareClear.addEventListener('click', () => {
    state.compareIds = [];
    render();
  });
  els.detailModal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
}

function populateFilterOptions() {
  const brands = [...new Set(state.pumps.map(p => p.brand))].sort();
  const connectors = [...new Set(state.pumps.map(p => p.connectorType))].sort();

  for (const b of brands) {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    els.filterBrand.appendChild(opt);
  }
  for (const c of connectors) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    els.filterConnector.appendChild(opt);
  }
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
  const connector = els.filterConnector.value;

  return state.pumps.filter(p =>
    matchesKeyword(p, keyword) &&
    (!brand || p.brand === brand) &&
    (!connector || p.connectorType === connector)
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
    <img src="${pump.imageUrl}" alt="${pump.name}" loading="lazy">
    <div class="body">
      <h3>${pump.name}</h3>
      <span class="oem">${pump.oemCode}</span>
      <span class="models">適用：${(pump.models || []).join('、')}</span>
      <span class="specs">${pump.brand} · ${pump.displacement} · ${pump.connectorType}</span>
      <span class="price">NT$ ${pump.price.toLocaleString()}</span>
      <div class="card-actions">
        <button type="button" data-action="detail">查看詳情</button>
        <button type="button" data-action="compare" class="${inCompare ? 'added' : ''}">
          ${inCompare ? '已加入比對' : '加入比對'}
        </button>
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
      <img src="${pump.imageUrl}" alt="${pump.name}">
      <span class="name">${pump.name}</span>
      <button type="button" aria-label="移除">✕</button>
    `;
    item.querySelector('button').addEventListener('click', () => toggleCompare(id));
    els.compareList.appendChild(item);
  }
}

function openModal(pump) {
  els.detailModalCard.innerHTML = `
    <button class="close-btn" type="button" aria-label="關閉">✕</button>
    <img src="${pump.imageUrl}" alt="${pump.name}">
    <h2>${pump.name}</h2>
    <span class="oem">OEM碼：${pump.oemCode}</span>
    <table>
      <tr><td>適用品牌</td><td>${pump.brand}</td></tr>
      <tr><td>適用車型</td><td>${(pump.models || []).join('、')}</td></tr>
      <tr><td>年份範圍</td><td>${pump.yearRange}</td></tr>
      <tr><td>排氣量</td><td>${pump.displacement}</td></tr>
      <tr><td>電壓</td><td>${pump.voltage}</td></tr>
      <tr><td>接頭類型</td><td>${pump.connectorType}</td></tr>
      <tr><td>出油方式</td><td>${pump.outletType}</td></tr>
      <tr><td>固定方式</td><td>${pump.mountingType}</td></tr>
      <tr><td>外觀特徵</td><td>${pump.color}</td></tr>
      <tr><td>參考售價</td><td>NT$ ${pump.price.toLocaleString()}</td></tr>
      <tr><td>辨識備註</td><td>${pump.notes}</td></tr>
    </table>
  `;
  els.detailModalCard.querySelector('.close-btn').addEventListener('click', closeModal);
  els.detailModal.hidden = false;
}

function closeModal() {
  els.detailModal.hidden = true;
}
