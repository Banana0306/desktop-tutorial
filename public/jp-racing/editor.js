(function () {
  const PIN = 'jp2827';

  const FIELDS = [
    { section: '主頁' },
    { key: 'hero-tagline', label: '主頁標語', type: 'text' },
    { section: '關於我們' },
    { key: 'about-desc',   label: '公司簡介', type: 'textarea' },
    { key: 'feat1-title',  label: '特色一 標題', type: 'text' },
    { key: 'feat1-desc',   label: '特色一 說明', type: 'textarea' },
    { key: 'feat2-title',  label: '特色二 標題', type: 'text' },
    { key: 'feat2-desc',   label: '特色二 說明', type: 'textarea' },
    { key: 'feat3-title',  label: '特色三 標題', type: 'text' },
    { key: 'feat3-desc',   label: '特色三 說明', type: 'textarea' },
    { section: '聯絡資訊' },
    { key: 'addr',          label: '公司地址', type: 'text' },
    { key: 'phone1',        label: '電話一', type: 'text' },
    { key: 'phone2',        label: '電話二', type: 'text' },
    { key: 'contact-email', label: 'Email', type: 'text' },
    { key: 'contact-line',  label: 'LINE ID', type: 'text' },
    { key: 'hours1',        label: '營業時間（平日）', type: 'text' },
    { key: 'hours2',        label: '營業時間（週六）', type: 'text' },
  ];

  // Build toggle button
  const btn = document.createElement('button');
  btn.id = 'editor-toggle';
  btn.textContent = '✏️ 編輯';
  document.body.appendChild(btn);

  // Build panel HTML
  const fieldsHtml = FIELDS.map(f => {
    if (f.section) return `<div class="ed-section-title">${f.section}</div>`;
    if (f.type === 'textarea')
      return `<div class="ed-field"><label>${f.label}</label><textarea data-key="${f.key}" rows="3"></textarea></div>`;
    return `<div class="ed-field"><label>${f.label}</label><input type="text" data-key="${f.key}" /></div>`;
  }).join('');

  const panel = document.createElement('div');
  panel.id = 'editor-panel';
  panel.innerHTML = `
    <div class="ed-header">
      <h3>✏️ 編輯網站內容</h3>
      <button class="ed-close">✕</button>
    </div>
    <div class="ed-pin-wrap" id="edPinWrap">
      <p style="color:#b8c4e0;font-size:14px;margin:0">請輸入管理員密碼以啟用編輯</p>
      <input type="password" id="edPin" placeholder="管理員密碼" />
      <button id="edPinOk">確認登入</button>
      <p class="ed-pin-err" id="edPinErr"></p>
    </div>
    <div class="ed-fields" id="edFields" style="display:none">
      ${fieldsHtml}
      <div class="ed-actions">
        <button id="edSave">💾 儲存變更</button>
        <button id="edCancel">取消</button>
      </div>
      <p class="ed-status" id="edStatus"></p>
    </div>
  `;
  document.body.appendChild(panel);

  let unlocked = false;

  btn.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && unlocked) loadValues();
  });

  panel.querySelector('.ed-close').addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // Allow Enter key in PIN field
  panel.querySelector('#edPin').addEventListener('keydown', e => {
    if (e.key === 'Enter') panel.querySelector('#edPinOk').click();
  });

  panel.querySelector('#edPinOk').addEventListener('click', () => {
    if (panel.querySelector('#edPin').value === PIN) {
      unlocked = true;
      panel.querySelector('#edPinWrap').style.display = 'none';
      panel.querySelector('#edFields').style.display = 'flex';
      loadValues();
    } else {
      panel.querySelector('#edPinErr').textContent = '密碼錯誤，請再試一次';
    }
  });

  function getFieldContent(key) {
    const el = document.querySelector(`[data-field="${key}"]`);
    if (!el) return '';
    // Return text content (strip HTML comments, keep visible text)
    return el.innerText || el.textContent || '';
  }

  function loadValues() {
    FIELDS.forEach(f => {
      if (!f.key) return;
      const input = panel.querySelector(`[data-key="${f.key}"]`);
      if (input) input.value = getFieldContent(f.key).trim();
    });
    const status = panel.querySelector('#edStatus');
    status.textContent = '';
    status.style.color = '';
  }

  panel.querySelector('#edCancel').addEventListener('click', () => {
    panel.classList.remove('open');
  });

  panel.querySelector('#edSave').addEventListener('click', async () => {
    const fields = {};
    panel.querySelectorAll('[data-key]').forEach(el => {
      if (el.value.trim()) fields[el.dataset.key] = el.value.trim();
    });

    const status = panel.querySelector('#edStatus');
    status.textContent = '儲存中…';
    status.style.color = '#b8c4e0';

    try {
      const res = await fetch('/api/jp-racing/save-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: PIN, fields }),
      });
      const data = await res.json();
      if (data.ok) {
        status.textContent = '✓ 儲存成功！請重新整理頁面查看變更。';
        status.style.color = '#4caf50';
        // Update DOM immediately
        Object.entries(fields).forEach(([key, val]) => {
          const el = document.querySelector(`[data-field="${key}"]`);
          if (el) el.innerText = val;
        });
      } else {
        status.textContent = '儲存失敗：' + (data.error || '未知錯誤');
        status.style.color = '#ff6b6b';
      }
    } catch {
      status.textContent = '網路錯誤，請再試一次';
      status.style.color = '#ff6b6b';
    }
  });
})();
