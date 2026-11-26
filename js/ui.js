import { categories } from './analytics.js';
export const $ = id => document.getElementById(id);
export const fmt = (value, digits = 1) => value == null || !Number.isFinite(value) ? '–' : value.toLocaleString('ru-RU', { maximumFractionDigits: digits });
export const dateFmt = value => value ? value.split('-').reverse().join('.') : '–';
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const categoryLabel = key => categories.find(category => category[0] === key)?.[1] ?? key;
export const empty = columns => `<tr><td colspan="${columns}" class="empty">Нет записей по выбранным условиям</td></tr>`;
export const badge = (key, text = categoryLabel(key)) => `<span class="status ${key}">${esc(text)}</span>`;
export function card(title, value, note, tone = '') {
  return `<article class="card ${tone}"><span class="card-label">${esc(title)}</span><strong class="card-value">${esc(value)}</strong><span class="card-note">${esc(note)}</span></article>`;
}
export function options(items, key, label, all) {
  return `<option value="all">${esc(all)}</option>` + items.map(item => `<option value="${item[key]}">${esc(label(item))}</option>`).join('');
}
export function bars(element, rows, metric, suffix = '', threshold = null) {
  if (!rows.length) { element.innerHTML = '<p class="empty">Нет данных</p>'; return; }
  const max = Math.max(1, threshold ?? 0, ...rows.map(row => Math.max(row[metric] ?? 0, row.threshold ?? 0)));
  element.innerHTML = rows.map(row => {
    const value = row[metric];
    const marker = row.threshold ?? threshold;
    return `<div class="bar-row"><span>${esc(row.name)}</span><strong>${fmt(value)}${value === null ? '' : suffix}</strong>
      <div class="bar-track"><div class="bar-fill ${threshold !== null && value >= threshold ? 'critical' : ''}" style="width:${100 * (value ?? 0) / max}%"></div>
      ${marker === null ? '' : `<span class="bar-threshold" style="left:${100 * marker / max}%" title="Порог ${marker}"></span>`}</div></div>`;
  }).join('') + `<div class="axis"><span>0</span><span>${fmt(max)}${suffix}</span></div>`;
}
export function lineChart(element, rows, period, metric) {
  if (!rows.length) { element.innerHTML = '<p class="empty">Нет данных</p>'; return; }
  const width = 640, height = 240, left = 42, right = 24, top = 18, bottom = 34;
  const max = Math.max(metric === 'avg' ? 40 : 4, Math.ceil(Math.max(...rows.map(row => row.value)) / 4) * 4);
  const x = index => left + (width - left - right) * (rows.length === 1 ? 0.5 : index / (rows.length - 1));
  const y = value => height - bottom - (height - bottom - top) * value / max;
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Динамика показателя">`;
  for (let i = 0; i <= 4; i++) {
    const value = max * i / 4;
    svg += `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" stroke="#e5eaf0"/><text x="${left - 7}" y="${y(value) + 4}" text-anchor="end">${fmt(value)}</text>`;
  }
  if (metric === 'avg') svg += `<line x1="${left}" x2="${width - right}" y1="${y(30)}" y2="${y(30)}" stroke="#d05a5e" stroke-dasharray="5 4"/>`;
  svg += `<polyline fill="none" stroke="#176c77" stroke-width="2.7" stroke-linejoin="round" points="${rows.map((row, i) => `${x(i)},${y(row.value)}`).join(' ')}"/>`;
  const step = Math.max(1, Math.ceil(rows.length / 6));
  rows.forEach((row, i) => {
    svg += `<circle cx="${x(i)}" cy="${y(row.value)}" r="${rows.length > 30 ? 2 : 4}" fill="#176c77"><title>${esc(row.date)}: ${fmt(row.value)}</title></circle>`;
    if (rows.length <= 7) {
      const first = i === 0 && rows.length > 1;
      const last = i === rows.length - 1 && rows.length > 1;
      const anchor = first ? 'start' : last ? 'end' : 'middle';
      const labelX = x(i) + (first ? 6 : last ? -6 : 0);
      svg += `<text class="point-label" x="${labelX}" y="${Math.max(12, y(row.value) - 9)}" text-anchor="${anchor}">${fmt(row.value)}</text>`;
    }
    if (i === 0 || i === rows.length - 1 || (i % step === 0 && rows.length - 1 - i >= step / 2)) {
      const label = period === 'month' ? row.date.slice(5) + '.' + row.date.slice(0, 4) : row.date.slice(8) + '.' + row.date.slice(5, 7);
      svg += `<text x="${x(i)}" y="${height - 12}" text-anchor="middle">${label}</text>`;
    }
  });
  element.innerHTML = svg + '</svg>';
}
export function paginate(rows, index, size, prefix = '') {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  index = Math.max(0, Math.min(index, pages - 1));
  const visible = rows.slice(index * size, (index + 1) * size);
  $(`${prefix}rowrange`).textContent = visible.length ? `${index * size + 1}–${index * size + visible.length} из ${fmt(rows.length, 0)}` : '0 записей';
  $(`${prefix}pagenum`).textContent = `${index + 1} / ${pages}`;
  $(`${prefix}prev`).disabled = index === 0;
  $(`${prefix}next`).disabled = index >= pages - 1;
  return { visible, index };
}
export function downloadCSV(name, header, rows) {
  const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const text = '\ufeff' + [header, ...rows].map(row => row.map(quote).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
