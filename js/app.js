import { loadData } from './storage.js';
import { prepare, filterAppointments, matchesCommon, categories, waitCategory, workloadCategory, metrics, aggregate, trend, correlation, groupBy, mean, fullName } from './analytics.js';
import { $, fmt, dateFmt, esc, categoryLabel, empty, badge, card, options, bars, lineChart, paginate, downloadCSV } from './ui.js';

const titles = {
  dashboard: ['Обзор работы поликлиники', 'Посещаемость и время ожидания'],
  registry: ['Реестр приёмов', 'Поиск, фильтрация и выгрузка записей'],
  workload: ['Нагрузка врачей', 'Количество пациентов за смену']
};
const state = { page: 'dashboard', pageIndex: 0, shiftPage: 0, filtered: [], summary: [], registry: [], shifts: [] };
let data, model;

function readFilters() {
  return { from: $('from').value, to: $('to').value, department: $('department').value,
    doctor: $('doctor').value, wait: $('wait').value, age: $('age').value,
    impute: $('impute').checked, shiftStatus: $('kstatus').value };
}
function updateDoctors() {
  const department = $('department').value;
  const previous = $('doctor').value;
  const doctors = data.Doctors.filter(doctor => department === 'all' || String(doctor.department_id) === department);
  $('doctor').innerHTML = options(doctors, 'doctor_id', fullName, 'Все врачи');
  $('doctor').value = doctors.some(doctor => String(doctor.doctor_id) === previous) ? previous : 'all';
}
function dateRange(days) {
  if (days === 'all') return model.minDate;
  const date = new Date(`${model.maxDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - Number(days) + 1);
  return [model.minDate, date.toISOString().slice(0, 10)].sort().at(-1);
}
function updateQuickDates() {
  for (const button of document.querySelectorAll('[data-days]')) {
    const active = $('from').value === dateRange(button.dataset.days) && $('to').value === model.maxDate;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  }
}
function resetFilters() {
  $('from').value = model.minDate;
  $('to').value = model.maxDate;
  $('department').value = 'all';
  updateDoctors();
  $('doctor').value = 'all';
  $('wait').value = $('age').value = $('kstatus').value = 'all';
  $('impute').checked = true;
  $('search').value = '';
  refresh(true);
}
function refresh(resetPages = false) {
  if (resetPages) state.pageIndex = state.shiftPage = 0;
  const filters = readFilters();
  updateQuickDates();
  $('to').setCustomValidity(filters.from && filters.to && filters.from > filters.to ? 'Конечная дата раньше начальной' : '');
  state.filtered = filterAppointments(model.appointments, filters, model.median);
  state.shifts = model.shifts.filter(row => matchesCommon(row, row.record_date, filters) &&
    (filters.shiftStatus === 'all' || workloadCategory(row) === filters.shiftStatus));
  $('selection').textContent = filters.from && filters.to && filters.from > filters.to ? 'Проверьте даты периода' : state.page === 'workload'
    ? `Выбрано ${fmt(state.shifts.length, 0)} из ${fmt(model.shifts.length, 0)} смен`
    : `Выбрано ${fmt(state.filtered.length, 0)} из ${fmt(model.appointments.length, 0)} приёмов`;
  if (state.page === 'dashboard') renderDashboard();
  if (state.page === 'registry') renderRegistry();
  if (state.page === 'workload') renderWorkload();
}

function renderDashboard() {
  const rows = state.filtered;
  const m = metrics(rows);
  $('cards').innerHTML = [
    card('Приёмы', fmt(m.count, 0), 'За выбранный период'),
    card('Среднее ожидание', m.avg === null ? '—' : `${fmt(m.avg)} мин`, 'Цель: менее 15 мин', m.avg >= 30 ? 'danger' : m.avg >= 15 ? 'attention' : ''),
    card('Критические задержки', m.known ? `${fmt(100 * m.critical / m.known)}%` : '—', `${m.critical} приёмов от 30 мин`, m.critical ? 'danger' : ''),
    card('Пациенты', fmt(new Set(rows.map(row => row.patient_id)).size, 0), `${m.missing} приёмов без замера`)
  ].join('');
  const group = $('group').value;
  const metric = $('metric').value;
  state.summary = aggregate(rows, group === 'department' ? 'department' : 'doctor_short')
    .sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1) || a.name.localeCompare(b.name, 'ru'));
  $('grouphead').textContent = group === 'department' ? 'Отделение' : 'Врач';
  bars($('bars'), state.summary, metric, metric === 'avg' ? ' мин' : '', metric === 'avg' ? 30 : null);
  $('summary').innerHTML = state.summary.map(row => `<tr><td>${esc(row.name)}</td>${[row.count, row.avg, row.min, row.max, row.critical, row.missing].map(value => `<td class="num">${fmt(value)}</td>`).join('')}</tr>`).join('') || empty(7);
  renderTrend();
  renderDistribution();
  renderInsights(m);
  renderHeatmap();
}
function renderTrend() {
  const period = $('period').value, metric = $('trendmetric').value;
  const points = trend(state.filtered, period, metric);
  lineChart($('line'), points, period, metric);
  const suffix = metric === 'avg' ? ' мин' : '';
  $('trendnote').textContent = points.length > 1 ? `Начало: ${fmt(points[0].value)}${suffix} · конец: ${fmt(points.at(-1).value)}${suffix}` : '';
}
function renderDistribution() {
  const rows = state.filtered;
  const counts = Object.fromEntries(categories.map(([key]) => [key, 0]));
  rows.forEach(row => counts[waitCategory(row.wait)]++);
  $('distribution').innerHTML = rows.length ? `<div class="segment">${categories.map(([key, label, color]) => `<div title="${label}: ${counts[key]}" style="width:${100 * counts[key] / rows.length}%;background:${color}"></div>`).join('')}</div>
    <div class="legend">${categories.map(([key, label, color], i) => `<div class="legend-item"><span class="swatch" style="background:${color}"></span><span>${label}<small>${['До 15 мин', '15–19 мин', '20–29 мин', 'От 30 мин', 'Нет замера'][i]}</small></span><b>${counts[key]} <small>${fmt(100 * counts[key] / rows.length)}%</small></b></div>`).join('')}</div>` : '<p class="empty">Нет данных</p>';
}
function renderInsights(m) {
  const worst = aggregate(state.filtered, 'department').filter(row => row.avg !== null).sort((a, b) => b.avg - a.avg)[0];
  $('insights').innerHTML = m.avg === null ? '<p class="empty">Нет измерений</p>' :
    `<div class="insight ${m.avg >= 30 ? 'alert' : ''}"><strong>${m.avg < 15 ? 'Цель по ожиданию достигнута' : 'Среднее ожидание выше цели'}</strong><span>${fmt(m.avg)} мин при цели менее 15 мин.</span></div>
    ${worst ? `<div class="insight"><strong>Наибольшее среднее ожидание</strong><span>${esc(worst.name)} · ${fmt(worst.avg)} мин</span></div>` : ''}
    <div class="insight ${m.critical ? 'alert' : ''}"><strong>${m.critical} критических задержек</strong><span>${m.critical ? 'Проверьте расписание и распределение записей.' : 'Критических задержек нет.'}</span></div>`;
}
function renderHeatmap() {
  const fields = [['wait', 'Ожидание'], ['age', 'Возраст'], ['daily_count', 'Приёмов врача за день']];
  const rows = state.filtered.filter(row => row.wait !== null);
  const strong = [];
  const body = fields.map(([key, label], i) => `<tr><th>${label}</th>${fields.map(([other, otherLabel], j) => {
    const value = correlation(rows.map(row => row[key]), rows.map(row => row[other]));
    if (i < j && value !== null && Math.abs(value) > 0.7) strong.push(`${label} / ${otherLabel}: ${fmt(value, 2)}`);
    const color = value === null ? '#f1f4f8' : value >= 0 ? `rgba(24,128,128,${0.09 + 0.35 * Math.abs(value)})` : `rgba(208,90,94,${0.09 + 0.35 * Math.abs(value)})`;
    return `<td style="background:${color}">${value === null ? '—' : fmt(value, 2)}</td>`;
  }).join('')}</tr>`).join('');
  $('heatmap').innerHTML = `<table class="heat"><thead><tr><th>Показатель</th>${fields.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  $('corrnote').textContent = !rows.length ? 'Нет данных' : strong.length ? `Сильные связи: ${strong.join('; ')}` : 'Сильных связей между разными показателями нет.';
}

function renderRegistry() {
  const query = $('search').value.trim().toLocaleLowerCase('ru');
  const sort = $('sort').value;
  state.registry = state.filtered.filter(row => !query || [row.appointment_id, row.patient_id, row.doctor, row.department].some(value => String(value).toLocaleLowerCase('ru').includes(query)));
  state.registry.sort((a, b) => {
    if (sort === 'date-desc') return b.appointment_date.localeCompare(a.appointment_date) || b.appointment_id - a.appointment_id;
    if (sort === 'date-asc') return a.appointment_date.localeCompare(b.appointment_date) || a.appointment_id - b.appointment_id;
    if (sort === 'id-asc') return a.appointment_id - b.appointment_id;
    if (a.wait === null || b.wait === null) return a.wait === b.wait ? 0 : a.wait === null ? 1 : -1;
    return sort === 'wait-desc' ? b.wait - a.wait : a.wait - b.wait;
  });
  const { visible, index } = paginate(state.registry, state.pageIndex, Number($('pagesize').value));
  state.pageIndex = index;
  $('records').innerHTML = visible.map(row => `<tr><td>${row.appointment_id}</td><td class="nowrap">${dateFmt(row.appointment_date)}</td><td>${esc(row.department)}</td><td class="nowrap">${esc(row.doctor_short)}</td><td>№ ${row.patient_id}</td><td>${row.age}</td><td>${row.cabinet_number}</td><td>${fmt(row.wait)}${row.waiting_time === null && row.wait !== null ? ' *' : ''}</td><td>${badge(waitCategory(row.wait))}</td></tr>`).join('') || empty(9);
  $('estimate-note').hidden = !state.registry.some(row => row.waiting_time === null && row.wait !== null);
}
function renderWorkload() {
  const rows = state.shifts;
  const critical = rows.filter(row => workloadCategory(row) === 'critical').length;
  const average = mean(rows.map(row => row.patients_count));
  $('kcards').innerHTML = [card('Смены', fmt(rows.length, 0), 'За выбранный период'), card('Средняя нагрузка', fmt(average), 'Пациентов за смену'), card('Максимальная нагрузка', rows.length ? fmt(Math.max(...rows.map(row => row.patients_count)), 0) : '—', 'Пациентов за смену'), card('Критические смены', fmt(critical, 0), 'Терапевты · от 35 пациентов', critical ? 'danger' : '')].join('');
  const grouped = [...groupBy(rows, 'doctor_short')].map(([name, group]) => ({ name, avg: mean(group.map(row => row.patients_count)) })).sort((a, b) => b.avg - a.avg);
  bars($('kbars'), grouped, 'avg', ' чел.');
  rows.sort((a, b) => $('ksort').value === 'count' ? b.patients_count - a.patients_count || b.record_date.localeCompare(a.record_date) : b.record_date.localeCompare(a.record_date) || a.doctor_id - b.doctor_id);
  const { visible, index } = paginate(rows, state.shiftPage, Number($('ksize').value), 'k');
  state.shiftPage = index;
  $('krecords').innerHTML = visible.map(row => `<tr><td>${dateFmt(row.record_date)}</td><td>${esc(row.doctor)}</td><td>${esc(row.specialty)}</td><td>${row.patients_count}</td><td>${badge(workloadCategory(row), workloadCategory(row) === 'missing' ? 'Без норматива' : undefined)}</td></tr>`).join('') || empty(5);
}
function navigate() {
  const requested = location.hash.slice(1);
  state.page = Object.hasOwn(titles, requested) ? requested : 'dashboard';
  const workload = state.page === 'workload';
  document.querySelectorAll('.page').forEach(page => { page.hidden = page.id !== state.page; });
  document.querySelectorAll('.nav').forEach(link => {
    const active = link.dataset.page === state.page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.appointment-filter').forEach(el => { el.hidden = workload; });
  document.querySelectorAll('.shift-filter').forEach(el => { el.hidden = !workload; });
  [$('pagetitle').textContent, $('pagesub').textContent] = titles[state.page];
  refresh();
  window.scrollTo(0, 0);
}
function bindEvents() {
  window.addEventListener('hashchange', navigate);
  $('department').addEventListener('change', () => { updateDoctors(); refresh(true); });
  for (const id of ['from', 'to', 'doctor', 'wait', 'age', 'impute', 'kstatus']) $(id).addEventListener('change', () => refresh(true));
  $('reset').onclick = resetFilters;
  document.querySelectorAll('[data-days]').forEach(button => {
    button.onclick = () => { $('from').value = dateRange(button.dataset.days); $('to').value = model.maxDate; refresh(true); };
  });
  for (const id of ['group', 'metric']) $(id).onchange = renderDashboard;
  for (const id of ['period', 'trendmetric']) $(id).onchange = renderTrend;
  $('critical-link').onclick = () => { $('wait').value = 'critical'; $('search').value = ''; state.pageIndex = 0; };
  $('search').oninput = () => { state.pageIndex = 0; renderRegistry(); };
  for (const id of ['sort', 'pagesize']) $(id).onchange = () => { state.pageIndex = 0; renderRegistry(); };
  $('prev').onclick = () => { state.pageIndex--; renderRegistry(); };
  $('next').onclick = () => { state.pageIndex++; renderRegistry(); };
  for (const id of ['ksort', 'ksize']) $(id).onchange = () => { state.shiftPage = 0; renderWorkload(); };
  $('kprev').onclick = () => { state.shiftPage--; renderWorkload(); };
  $('knext').onclick = () => { state.shiftPage++; renderWorkload(); };
  $('export-summary').onclick = () => downloadCSV('summary.csv', ['Группа', 'Приёмов', 'Среднее', 'Минимум', 'Максимум', 'Критичных', 'Без данных'], state.summary.map(row => [row.name, row.count, row.avg?.toFixed(2), row.min, row.max, row.critical, row.missing]));
  $('export-rows').onclick = () => downloadCSV('appointments.csv', ['ID', 'Дата', 'Отделение', 'Врач', 'Пациент ID', 'Возраст', 'Кабинет', 'Исходное ожидание', 'Расчётное ожидание', 'Статус'], state.registry.map(row => [row.appointment_id, row.appointment_date, row.department, row.doctor, row.patient_id, row.age, row.cabinet_number, row.waiting_time, row.wait, categoryLabel(waitCategory(row.wait))]));
  $('export-kpi').onclick = () => downloadCSV('workload.csv', ['Дата', 'Врач', 'Специальность', 'Пациентов', 'Статус'], state.shifts.map(row => [row.record_date, row.doctor, row.specialty, row.patients_count, workloadCategory(row) === 'missing' ? 'Без норматива' : categoryLabel(workloadCategory(row))]));
}
async function init() {
  try {
    data = await loadData();
    model = prepare(data);
    $('department').innerHTML = options(data.Departments, 'department_id', row => row.department_name, 'Все отделения');
    $('data-range').textContent = `${dateFmt(model.minDate)} — ${dateFmt(model.maxDate)}`;
    $('impute').title = `Для отсутствующих замеров: ${fmt(model.median)} мин`;
    bindEvents();
    resetFilters();
    navigate();
    $('dbstatus').textContent = 'База подключена';
    $('loading').hidden = true;
    $('content').hidden = false;
  } catch (error) {
    $('loading').hidden = true;
    $('error').hidden = false;
    $('error').textContent = `Не удалось загрузить данные: ${error.message}. Откройте страницу через HTTP(S).`;
    $('dbstatus').textContent = 'Нет подключения';
    console.error(error);
  }
}
init();
