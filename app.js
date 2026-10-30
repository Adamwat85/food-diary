const MEALS = [
  { id: 'morning', name: 'בוקר' },
  { id: 'noon', name: 'צהריים' },
  { id: 'evening', name: 'ערב' },
];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const KEY = 'food-diary-v1';

// data: { "YYYY-MM-DD": { morning: [{id, text, time}], noon: [...], evening: [...] } }
const MAX_TEXT = 200;
// Accept only well-formed records; anything else (from storage or a backup file) is dropped.
function clean(raw) {
  const out = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== 'object') continue;
    const day = { morning: [], noon: [], evening: [] };
    for (const m of MEALS) {
      if (!Array.isArray(v[m.id])) continue;
      for (const it of v[m.id].slice(0, 100)) {
        if (!it || typeof it.text !== 'string' || !it.text.trim()) continue;
        day[m.id].push({
          id: typeof it.id === 'string' && /^[a-z0-9]{1,20}$/.test(it.id) ? it.id : newId(),
          text: it.text.trim().slice(0, MAX_TEXT),
          time: typeof it.time === 'string' && /^\d{2}:\d{2}$/.test(it.time) ? it.time : '',
        });
      }
    }
    if (MEALS.some(m => day[m.id].length)) out[k] = day;
  }
  return out;
}
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

let data;
try { data = clean(JSON.parse(localStorage.getItem(KEY))); } catch { data = Object.create(null); }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch { toast('השמירה נכשלה - האחסון בטלפון מלא או חסום'); }
}

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const shortDate = d => `${d.getDate()}.${d.getMonth() + 1}`;
const weekStart = d => addDays(d, -d.getDay()); // week starts on Sunday
const todayIso = () => iso(new Date());

function mealByClock() {
  const h = new Date().getHours();
  return h < 11 ? 'morning' : h < 17 ? 'noon' : 'evening';
}

let dayIso = todayIso();
let selMeal = mealByClock();
let weekOf = weekStart(new Date());

function entriesFor(day) {
  return data[day] || { morning: [], noon: [], evening: [] };
}

/* ---------- day view ---------- */
function renderDay() {
  const d = fromIso(dayIso);
  const isToday = dayIso === todayIso();
  $('day-title').innerHTML = `${isToday ? 'היום, ' : ''}יום ${DAY_NAMES[d.getDay()]}<small>${d.toLocaleDateString('he-IL')}</small>`;
  $('day-today').hidden = isToday;

  document.querySelectorAll('#meal-pick button').forEach(b =>
    b.setAttribute('aria-pressed', b.dataset.meal === selMeal));

  const e = entriesFor(dayIso);
  $('meals').innerHTML = MEALS.map(m => {
    const items = e[m.id] || [];
    const list = items.length
      ? items.map(it => `<li><span class="t">${esc(it.text)}</span>${it.time ? `<time>${esc(it.time)}</time>` : ''}
          <button class="del" data-meal="${m.id}" data-id="${esc(it.id)}" aria-label="מחק ${esc(it.text)}">✕</button></li>`).join('')
      : `<li class="empty">עוד לא נרשם כלום</li>`;
    return `<div class="meal" data-meal="${m.id}"><h3>${m.name}<span>${items.length || ''}</span></h3><ul>${list}</ul></div>`;
  }).join('');
  renderSuggestions();
}

function renderSuggestions() {
  const counts = {};
  Object.values(data).forEach(day => MEALS.forEach(m =>
    (day[m.id] || []).forEach(it => { counts[it.text] = (counts[it.text] || 0) + 1; })));
  $('food-suggest').innerHTML = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a]).slice(0, 40)
    .map(t => `<option value="${esc(t)}">`).join('');
}

$('meal-pick').addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  selMeal = b.dataset.meal; renderDay(); $('food-input').focus();
});

$('add-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const text = $('food-input').value.trim();
  if (!text) { $('food-input').focus(); return; }
  const day = data[dayIso] || (data[dayIso] = { morning: [], noon: [], evening: [] });
  const now = new Date();
  day[selMeal].push({
    id: newId(),
    text: text.slice(0, MAX_TEXT),
    time: dayIso === todayIso() ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : '',
  });
  save();
  $('food-input').value = '';
  renderDay();
  toast(`נוסף ל${MEALS.find(m => m.id === selMeal).name}`);
});

$('meals').addEventListener('click', ev => {
  const b = ev.target.closest('.del'); if (!b) return;
  const day = data[dayIso]; if (!day) return;
  day[b.dataset.meal] = day[b.dataset.meal].filter(it => it.id !== b.dataset.id);
  if (MEALS.every(m => !day[m.id].length)) delete data[dayIso];
  save(); renderDay();
});

$('day-prev').onclick = () => { dayIso = iso(addDays(fromIso(dayIso), -1)); renderDay(); };
$('day-next').onclick = () => { dayIso = iso(addDays(fromIso(dayIso), 1)); renderDay(); };
$('day-today').onclick = () => { dayIso = todayIso(); renderDay(); };

/* ---------- week view ---------- */
function weekDays() { return [...Array(7)].map((_, i) => addDays(weekOf, i)); }

function renderWeek() {
  const days = weekDays();
  $('week-title').innerHTML = `שבוע ${shortDate(days[0])} – ${shortDate(days[6])}<small>${days[0].getFullYear()}</small>`;
  const t = todayIso();
  let total = 0, filled = 0;
  $('week-body').innerHTML = days.map(d => {
    const k = iso(d), e = entriesFor(k);
    const cells = MEALS.map(m => {
      const items = e[m.id] || [];
      total += items.length; if (items.length) filled++;
      return `<td>${items.length ? `<ul>${items.map(it => `<li>${esc(it.text)}</li>`).join('')}</ul>` : '<span class="none">—</span>'}</td>`;
    }).join('');
    return `<tr data-day="${k}" class="${k === t ? 'today' : ''}"><th>${DAY_NAMES[d.getDay()]}<small>${shortDate(d)}</small></th>${cells}</tr>`;
  }).join('');
  $('week-stats').textContent = `${total} פריטים נרשמו השבוע · ${filled} מתוך 21 ארוחות מולאו. לחיצה על שורה פותחת את היום לעריכה.`;
}

$('week-body').addEventListener('click', ev => {
  const tr = ev.target.closest('tr'); if (!tr) return;
  dayIso = tr.dataset.day; showTab('day');
});
$('week-prev').onclick = () => { weekOf = addDays(weekOf, -7); renderWeek(); };
$('week-next').onclick = () => { weekOf = addDays(weekOf, 7); renderWeek(); };

function weekAsText() {
  const days = weekDays();
  const lines = [`יומן אוכל – שבוע ${shortDate(days[0])}–${shortDate(days[6])}`, ''];
  days.forEach(d => {
    const e = entriesFor(iso(d));
    lines.push(`יום ${DAY_NAMES[d.getDay()]} ${shortDate(d)}`);
    MEALS.forEach(m => lines.push(`  ${m.name}: ${(e[m.id] || []).map(i => i.text).join(', ') || '—'}`));
    lines.push('');
  });
  return lines.join('\n');
}

$('share-week').onclick = async () => {
  const text = weekAsText();
  if (navigator.share) {
    try { await navigator.share({ title: 'יומן אוכל שבועי', text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('הטבלה הועתקה'); }
  catch { toast('לא ניתן להעתיק במכשיר הזה'); }
};

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = s => {
  let v = String(s);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // block formula injection when opened in Excel
  return `"${v.replace(/"/g, '""')}"`;
};

$('csv-week').onclick = () => {
  const days = weekDays();
  const rows = [['יום', 'תאריך', ...MEALS.map(m => m.name)]];
  days.forEach(d => {
    const e = entriesFor(iso(d));
    rows.push([DAY_NAMES[d.getDay()], d.toLocaleDateString('he-IL'), ...MEALS.map(m => (e[m.id] || []).map(i => i.text).join(', '))]);
  });
  // BOM so Excel opens Hebrew correctly
  download(`food-week-${iso(days[0])}.csv`, '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
};

$('backup').onclick = () => download(`food-diary-backup-${todayIso()}.json`, JSON.stringify(data, null, 1), 'application/json');
$('restore').onchange = async ev => {
  const f = ev.target.files[0]; if (!f) return;
  if (f.size > 2_000_000) { toast('הקובץ גדול מדי לגיבוי של יומן האוכל'); ev.target.value = ''; return; }
  try {
    const incoming = clean(JSON.parse(await f.text()));
    Object.entries(incoming).forEach(([k, v]) => {
      const day = data[k] || (data[k] = { morning: [], noon: [], evening: [] });
      MEALS.forEach(m => v[m.id].forEach(it => {
        if (!day[m.id].some(x => x.id === it.id)) day[m.id].push(it);
      }));
    });
    save(); renderWeek(); toast('הגיבוי שוחזר');
  } catch { toast('הקובץ לא נקרא – יש לבחור קובץ גיבוי של יומן האוכל'); }
  ev.target.value = '';
};
$('clear-week').onclick = () => { $('clear-confirm').hidden = false; };
$('clear-no').onclick = () => { $('clear-confirm').hidden = true; };
$('clear-yes').onclick = () => {
  weekDays().forEach(d => delete data[iso(d)]);
  save(); $('clear-confirm').hidden = true; renderWeek(); toast('השבוע נמחק');
};

/* ---------- shared ---------- */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2000);
}

function showTab(which) {
  $('tab-day').setAttribute('aria-selected', which === 'day');
  $('tab-week').setAttribute('aria-selected', which === 'week');
  $('view-day').hidden = which !== 'day';
  $('view-week').hidden = which !== 'week';
  if (which === 'day') renderDay();
  else { weekOf = weekStart(fromIso(dayIso)); renderWeek(); }
}
$('tab-day').onclick = () => showTab('day');
$('tab-week').onclick = () => showTab('week');

// after midnight, jump to the new day when the app comes back to the foreground
let lastToday = todayIso();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayIso() !== lastToday) {
    if (dayIso === lastToday) dayIso = todayIso();
    lastToday = todayIso(); selMeal = mealByClock(); renderDay();
  }
});

renderDay();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
