const rules = []; // { action: 'permit'|'deny', ipInt, wmInt, start, end }



const actionSelect = document.getElementById('actionSelect');
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');

const ipInputs = setupOctetGroup(document.getElementById('ipGroup'));
const wmInputs = setupOctetGroup(document.getElementById('wmGroup'));

const rulesList = document.getElementById('rulesList');
const barEl = document.getElementById('bar');
const barLabelsEl = document.getElementById('barLabels');

const helpModal = document.getElementById('helpModal');
const helpClose = document.getElementById('helpClose');

const scaleToggle = document.getElementById('scaleToggle');
const barWrap = document.getElementById('barWrap');
const intervalListWrap = document.getElementById('intervalListWrap');
const intervalList = document.getElementById('intervalList');

sendBtn.addEventListener('click', () => addRuleFromUI());

scaleToggle.addEventListener('change', () => { renderCoverage(); });





helpClose.addEventListener('click', closeHelpModal);
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) closeHelpModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    if (helpModal.hidden) openHelpModal();
    else closeHelpModal();
    return;
  }
  
  // Si la modal est ouverte: on ne laisse passer que Escape
  if (!helpModal.hidden) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeHelpModal();
    }
    return;
  }

  if (e.key === '-' || e.key === '_' || e.code === 'Minus') {
    e.preventDefault();
    toggleActionMode();
  }
});


// All Rapid Action on the input
function setupOctetGroup(groupEl) {
  const inputs = [...groupEl.querySelectorAll('input.octet')];

  //If "." then next input in the input group your in
  //If "Enter" then addRuleFromUI() is call
  inputs.forEach((inp, i) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === '.') {
        e.preventDefault();
        focusIndex(inputs, i + 1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        addRuleFromUI();
        return;
      }
      if (e.key === 'Backspace' && inp.value === '' && i > 0) {
        inputs[i - 1].focus();
      }
    });

    inp.addEventListener('input', () => {
        //Only Digit
      inp.value = inp.value.replace(/[^\d]/g, '').slice(0, 3);

      // 3 digits MAX then input + 1
      if (inp.value.length === 3) {
        const n = Number(inp.value);
        if (Number.isFinite(n) && n > 255) inp.value = '255';
        focusIndex(inputs, i + 1);
      }
    });


    inp.addEventListener('blur', () => {
      if (inp.value === '') return;
      const n = Number(inp.value);
      if (!Number.isFinite(n)) inp.value = '';
      else inp.value = String(Math.min(255, Math.max(0, n)));
    });

    inp.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text')?.trim() ?? '';
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
        e.preventDefault();
        const parts = text.split('.').map(x => String(Math.min(255, Math.max(0, Number(x)))));
        parts.forEach((p, idx) => inputs[idx].value = p);
        focusIndex(inputs, 3);
      }
    });
  });

  return inputs;
}

function focusIndex(inputs, idx) {
  if (idx < 0) idx = 0;
  if (idx >= inputs.length) idx = inputs.length - 1;
  inputs[idx].focus();
  inputs[idx].select?.();
}


//Ajout de règle d'ACE
function addRuleFromUI() {
  const action = actionSelect.value;

  const ipParts = readOctets(ipInputs);
  const wmParts = readOctets(wmInputs);

  if (!ipParts || !wmParts) {
    setStatus("IP or wildmask invalid (0-255).");
    ipInputs[0].focus();
    return;
  }


  //Transforme en bit
  const ipInt = ipToInt(ipParts);
  const wmInt = ipToInt(wmParts);

  //~inverse les bits 
  //Start = AND Gate between IP and ~Wildcard
  //End = OR Gate between IP and Wildcard
  const start = (ipInt & (~wmInt)) >>> 0;
  const end = (ipInt | wmInt) >>> 0;

  rules.push({ action, ipInt, wmInt, start, end });

  setStatus(`Add: ${action.toUpperCase()} ${intToIp(ipInt)} ${intToIp(wmInt)} (range ${intToIp(start)} → ${intToIp(end)})`);

  // clear IP inputs but keep wildmask
  clearOctets(ipInputs);
  ipInputs[0].focus();

  renderAll();
}

function readOctets(inputs) {
  const parts = inputs.map(i => i.value.trim());
  if (parts.some(p => p === '')) return null;
  const nums = parts.map(p => Number(p));
  if (nums.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function clearOctets(inputs) {
  inputs.forEach(i => i.value = '');
}



//Right Part
function renderAll() {
  renderRules();
  renderCoverage();
}

function renderRules() {
  rulesList.innerHTML = '';

  let dragFrom = null;

  rules.forEach((r, idx) => {
    const li = document.createElement('li');
    li.className = `ruleItem ${r.action}`;
    li.draggable = true;

    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = String(idx + 1);

    const txt = document.createElement('div');
    txt.className = 'ruleText';
    txt.title = 'Drag & drop to move';
    txt.innerHTML = `
      <div class="line1">${r.action.toUpperCase()} ${intToIp(r.ipInt)} ${intToIp(r.wmInt)}</div>
      <div class="line2">Range: ${intToIp(r.start)} → ${intToIp(r.end)}</div>
    `;

    const del = document.createElement('button');
    del.className = 'delBtn';
    del.type = 'button';
    del.textContent = '×';
    del.title = 'Supprimer';
    del.addEventListener('click', () => {
      rules.splice(idx, 1);
      setStatus('Deleted.');
      renderAll();
      ipInputs[0].focus();
    });

    // drag & drop
    li.addEventListener('dragstart', () => {
      dragFrom = idx;
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragFrom === null || dragFrom === idx) return;
      moveRule(dragFrom, idx);
      dragFrom = null;
    });

    li.appendChild(badge);
    li.appendChild(txt);
    li.appendChild(del);
    rulesList.appendChild(li);
  });

  if (rules.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = 'var(--muted)';
    empty.style.padding = '10px 4px';
    empty.textContent = 'No Entry. Add ACE at the top.';
    rulesList.appendChild(empty);
  }
}

function moveRule(from, to) {
  const [it] = rules.splice(from, 1);
  rules.splice(to, 0, it);
  setStatus('Switch Order.');
  renderAll();
}

/* =========================
   Coverage computation (first match wins)
========================= */
function renderCoverage() {
  barEl.innerHTML = '';
  barLabelsEl.innerHTML = '';
  intervalList.innerHTML = '';

  const computed = computeEffectiveIntervals(rules);

  // Si rien à montrer
  if (!computed.span) {
    // mode bar
    if (scaleToggle.checked) {
      barWrap.hidden = false;
      intervalListWrap.hidden = true;

      const seg = document.createElement('div');
      seg.className = 'seg none';
      seg.style.height = '100%';
      barEl.appendChild(seg);

      barLabelsEl.appendChild(makeLabel(50, 'none', 'Aucune règle'));
      return;
    }

    // mode list
    barWrap.hidden = true;
    intervalListWrap.hidden = false;

    const li = document.createElement('li');
    li.className = 'intervalItem none';
    li.innerHTML = `<span class="intervalBadge">NONE</span><span class="intervalRange">Aucune règle</span>`;
    intervalList.appendChild(li);
    return;
  }

  // Si Scale OFF => liste lisible (pas de superposition)
  if (!scaleToggle.checked) {
    barWrap.hidden = true;
    intervalListWrap.hidden = false;

    for (const seg of computed.intervals) {
      const li = document.createElement('li');
      li.className = `intervalItem ${seg.action}`;
      li.innerHTML = `
        <span class="intervalBadge">${seg.action.toUpperCase()}</span>
        <span class="intervalRange">${intToIp(seg.start)} → ${intToIp(seg.end)}</span>
      `;
      intervalList.appendChild(li);
    }
    return;
  }

  // Scale ON => barre
  barWrap.hidden = false;
  intervalListWrap.hidden = true;

  const { spanStart, spanEnd, intervals } = computed;
  const total = spanEnd - spanStart + 1;

  let acc = 0;

  intervals.forEach((seg, i) => {
    const len = seg.end - seg.start + 1;
    const pct = (len / total) * 100;

    const div = document.createElement('div');
    div.className = `seg ${seg.action}`;
    div.style.height = `${pct}%`;
    barEl.appendChild(div);

    // label au début du segment
    const topPct = (acc / total) * 100;
    barLabelsEl.appendChild(makeLabel(topPct, seg.action, intToIp(seg.start)));

    acc += len;

    // label de fin (dernier segment)
    if (i === intervals.length - 1) {
      const endTop = (acc / total) * 100;
      barLabelsEl.appendChild(makeLabel(endTop, seg.action, intToIp(seg.end)));
    }
  });
}


function computeEffectiveIntervals(rulesArr) {
  const MAX = 0xFFFFFFFF;

  let intervals = [{ start: 0, end: MAX, action: 'none' }];

  // Apply each rule to "none" parts only (first match wins)
  for (const r of rulesArr) {
    const rs = r.start >>> 0;
    const re = r.end >>> 0;

    const next = [];

    for (const seg of intervals) {
      if (seg.action !== 'none') {
        next.push(seg);
        continue;
      }

      // no overlap
      if (re < seg.start || rs > seg.end) {
        next.push(seg);
        continue;
      }

      // overlap => split
      const a = seg.start;
      const b = seg.end;
      const is = Math.max(a, rs);
      const ie = Math.min(b, re);

      if (a < is) next.push({ start: a, end: is - 1, action: 'none' });
      next.push({ start: is, end: ie, action: r.action });
      if (ie < b) next.push({ start: ie + 1, end: b, action: 'none' });
    }

    intervals = next;
  }

  const touched = intervals.filter(x => x.action !== 'none');
  if (touched.length === 0) return { span: null };

  let spanStart = touched.reduce((m, x) => Math.min(m, x.start), Infinity);
  let spanEnd = touched.reduce((m, x) => Math.max(m, x.end), -Infinity);

  // Crop to the useful span (min..max touched), keep gray gaps inside
  intervals = intervals
    .filter(x => x.end >= spanStart && x.start <= spanEnd)
    .map(x => ({
      start: Math.max(x.start, spanStart),
      end: Math.min(x.end, spanEnd),
      action: x.action
    }))
    .sort((a, b) => a.start - b.start);

  // Merge adjacent same-action segments (important for your example)
  const merged = [];
  for (const seg of intervals) {
    const last = merged[merged.length - 1];
    if (last && last.action === seg.action && (last.end + 1) === seg.start) {
      last.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }

  return { spanStart, spanEnd, intervals: merged, span: true };
}



//Converti en Bits
function ipToInt([a, b, c, d]) {
  const n = ((a & 255) << 24) | ((b & 255) << 16) | ((c & 255) << 8) | (d & 255);
  return n >>> 0;
}

function intToIp(n) {
  n = n >>> 0;
  const a = (n >>> 24) & 255;
  const b = (n >>> 16) & 255;
  const c = (n >>> 8) & 255;
  const d = n & 255;
  return `${a}.${b}.${c}.${d}`;
}

function makeLabel(topPct, action, text) {
  const el = document.createElement('div');
  el.className = `lbl ${action}`;
  el.style.top = `${clamp(topPct, 0, 100)}%`;
  el.innerHTML = `<span class="pin"></span><span>${escapeHtml(text)}</span>`;
  return el;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

//For Modal 
function openHelpModal() {
  helpModal.hidden = false;
  helpClose.focus();
}

function closeHelpModal() {
  helpModal.hidden = true;
  ipInputs[0].focus();
}

function toggleActionMode() {
  actionSelect.value = (actionSelect.value === 'permit') ? 'deny' : 'permit';
  setStatus(`Toggled: ${actionSelect.value.toUpperCase()} (HotKey -)`);
}

/* initial render */
openHelpModal();
renderAll();
setStatus("Ready. Add an ACE (Enter or Send).");
ipInputs[0].focus();


