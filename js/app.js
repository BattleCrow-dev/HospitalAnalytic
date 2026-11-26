import { roles, normalizeAccount, scopedData, restoreAccount, saveAccount } from './access.js';
import { loadData } from './storage.js';
import { prepare, filterAppointments, matchesCommon, categories, waitCategory, workloadCategory, metrics, aggregate, trend, groupBy, mean, fullName, workloadNorms } from './analytics.js';
import { $, fmt, dateFmt, esc, categoryLabel, empty, badge, card, options, bars, lineChart, paginate, downloadCSV } from './ui.js';

const state = { pageIndex: 0, shiftPage: 0, filtered: [], registry: [], shiftRegistry: [], period: null };
let sourceData, data, model, account;
const canView = section => roles[account.role].sections.includes(section);
const canExport = section => canView(section) && roles[account.role].export;

function selectOptions(rows, key, label) {
  return rows.map(row => `<option value="${row[key]}">${esc(label(row))}</option>`).join('');
}

function applyAccount(next, initial = false) {
  account = normalizeAccount(next, sourceData);
  saveAccount(account);
  data = scopedData(sourceData, account);
  model = prepare(data);
  const role = roles[account.role];
  $('role').value = account.role;
  $('account-department').value = String(account.departmentId);
  $('account-doctor').value = String(account.doctorId);
  $('account-department-label').hidden = account.role !== 'head';
  $('account-doctor-label').hidden = account.role !== 'doctor';
  $('profile-avatar').src = role.avatar;
  $('profile-name').textContent = account.role === 'doctor' ? fullName(data.Doctors[0]) : role.name;
  $('profile-role').textContent = role.title;
  $('profile-scope').textContent = account.role === 'head' ? data.Departments[0].department_name :
    account.role === 'doctor' ? data.Doctors[0].specialty : 'Вся поликлиника';
  $('workspace-title').textContent = account.role === 'doctor' ? 'Рабочий стол врача' : 'Рабочий стол';
  $('workspace-description').textContent = account.role === 'doctor' ? 'Мои приёмы и нагрузка' : 'Посещаемость, ожидание и нагрузка персонала';
  for (const section of ['dashboard', 'registry', 'workload']) {
    $(section).hidden = !canView(section);
    document.querySelector(`.nav[data-section="${section}"]`).hidden = !canView(section);
  }
  $('export-rows').hidden = !canExport('registry');
  $('export-kpi').hidden = !canExport('workload');
  // Сбрасываем результаты предыдущего профиля и локальные фильтры.
  for (const id of ['cards', 'bars', 'line', 'distribution', 'records', 'kcards', 'kbars', 'krecords', 'workload-norms']) $(id).replaceChildren();
  $('trendnote').textContent = '';
  for (const id of ['rowrange', 'pagenum', 'krowrange', 'kpagenum']) $(id).textContent = '';
  state.registry = []; state.shiftRegistry = [];
  $('registry-department').innerHTML = options(data.Departments, 'department_id', row => row.department_name, 'Все отделения');
  $('registry-department').parentElement.hidden = data.Departments.length === 1;
  $('registry-doctor').innerHTML = '';
  updateDoctors();
  $('registry-doctor').parentElement.hidden = data.Doctors.length === 1;
  $('search').value = '';
  for (const id of ['wait', 'age', 'kstatus']) $(id).value = 'all';
  if (initial) resetDates();
  else {
    if (!canView(location.hash.slice(1))) history.replaceState(null, '', `#${role.sections[0]}`);
    if (!$('from').value || !$('to').value || $('from').value > $('to').value) {
      $('from').value = state.period.from;
      $('to').value = state.period.to;
    }
    refresh();
    window.scrollTo({ top: 0, behavior: 'instant' });
    updateNavigation();
  }
}

function readFilters(registry = false) {
  return {
    from: registry ? state.period.from : $('from').value,
    to: registry ? state.period.to : $('to').value,
    department: registry ? $('registry-department').value : 'all',
    doctor: registry ? $('registry-doctor').value : 'all'
  };
}
function updateDoctors() {
  const department = $('registry-department').value;
  const select = $('registry-doctor');
  const previous = select.value;
  const doctors = data.Doctors.filter(doctor => department === 'all' || String(doctor.department_id) === department);
  select.innerHTML = options(doctors, 'doctor_id', fullName, 'Все врачи');
  select.value = doctors.some(doctor => String(doctor.doctor_id) === previous) ? previous : 'all';
}
function resetDates() {
  const dates = prepare(sourceData);
  $('from').value = dates.minDate;
  $('to').value = dates.maxDate;
  refresh();
}
function refresh() {
  const filters = readFilters();
  const invalid = !filters.from || !filters.to || filters.from > filters.to;
  $('date-error').hidden = !invalid;
  $('date-error').textContent = invalid ? 'Укажите корректный период' : '';
  $('to').setCustomValidity(invalid ? 'Укажите корректный период' : '');
  if (invalid) return;
  state.period = filters;
  state.pageIndex = state.shiftPage = 0;
  state.filtered = filterAppointments(model.appointments, filters);
  renderDashboard();
  renderRegistry();
  renderWorkload();
}

function renderDashboard() {
  if (!canView('dashboard')) return;
  const rows = state.filtered;
  const m = metrics(rows);
  $('cards').innerHTML = [
    card('Приёмы', fmt(m.count, 0), 'За выбранный период'),
    card('Среднее ожидание', m.avg === null ? '–' : `${fmt(m.avg)} мин`, 'Цель: менее 15 мин', m.avg >= 30 ? 'danger' : m.avg >= 15 ? 'attention' : ''),
    card('Критические задержки', m.known ? `${fmt(100 * m.critical / m.known)}%` : '–', `${m.critical} из ${fmt(m.known, 0)} замеров`, m.critical ? 'danger' : ''),
    card('Пациенты', fmt(new Set(rows.map(row => row.patient_id)).size, 0), 'Уникальных пациентов')
  ].join('');
  renderComparison(rows);
  renderTrend();
  renderDistribution();
}
// Сравнение имеет смысл только при наличии хотя бы двух групп.
function renderComparison(rows) {
  const summaries = {
    department: aggregate(rows, 'department'),
    doctor: aggregate(rows, 'doctor_short')
  };
  const available = Object.keys(summaries).filter(key => summaries[key].length > 1);
  const select = $('group');
  const previous = select.value;
  for (const option of select.options) {
    option.hidden = option.disabled = !available.includes(option.value);
  }
  const visible = available.length > 0;
  $('comparison-panel').hidden = !visible;
  $('overview-charts').classList.toggle('single-chart', !visible);
  if (!visible) {
    $('bars').replaceChildren();
    return;
  }
  select.value = available.includes(previous) ? previous : available[0];
  select.parentElement.hidden = available.length === 1;
  const metric = $('metric').value;
  const summary = summaries[select.value]
    .sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1) || a.name.localeCompare(b.name, 'ru'));
  bars($('bars'), summary, metric, metric === 'avg' ? ' мин' : '', metric === 'avg' ? 30 : null);
}
function renderTrend() {
  if (!canView('dashboard')) return;
  const period = $('period').value, metric = $('trendmetric').value;
  const points = trend(state.filtered, period, metric);
  lineChart($('line'), points, period, metric);
  const suffix = metric === 'avg' ? ' мин' : '';
  $('trendnote').textContent = points.length > 1 ? `Начало: ${fmt(points[0].value)}${suffix} · конец: ${fmt(points.at(-1).value)}${suffix}` : '';
}
function renderDistribution() {
  if (!canView('dashboard')) return;
  const rows = state.filtered;
  const counts = Object.fromEntries(categories.map(([key]) => [key, 0]));
  rows.forEach(row => counts[waitCategory(row.wait)]++);
  $('distribution').innerHTML = rows.length ? `<div class="segment">${categories.map(([key, label, color]) => `<div title="${label}: ${counts[key]}" style="width:${100 * counts[key] / rows.length}%;background:${color}"></div>`).join('')}</div>
    <div class="legend">${categories.map(([key, label, color], i) => `<div class="legend-item"><span class="swatch" style="background:${color}"></span><span>${label}<small>${['До 15 мин', '15–19 мин', '20–29 мин', 'От 30 мин'][i]}</small></span><b>${counts[key]} <small>${fmt(100 * counts[key] / rows.length)}%</small></b></div>`).join('')}</div>` : '<p class="empty">Нет данных</p>';
}
function renderRegistry() {
  if (!canView('registry')) return;
  const query = $('search').value.trim().toLocaleLowerCase('ru');
  const sort = $('sort').value;
  const wait = $('wait').value;
  const age = $('age').value;
  state.registry = filterAppointments(state.filtered, readFilters(true)).filter(row =>
    (wait === 'all' || waitCategory(row.wait) === wait) &&
    (age === 'all' || (age === 'senior' ? row.age >= 60 : row.age < 60)) &&
    (!query || [row.appointment_id, row.patient_id, row.doctor, row.department]
      .some(value => String(value).toLocaleLowerCase('ru').includes(query)))
  );
  state.registry.sort((a, b) => {
    if (sort === 'date-desc') return b.appointment_date.localeCompare(a.appointment_date) || b.appointment_id - a.appointment_id;
    if (sort === 'date-asc') return a.appointment_date.localeCompare(b.appointment_date) || a.appointment_id - b.appointment_id;
    if (sort === 'id-asc') return a.appointment_id - b.appointment_id;
    return sort === 'wait-desc' ? b.wait - a.wait : a.wait - b.wait;
  });
  const { visible, index } = paginate(state.registry, state.pageIndex, Number($('pagesize').value));
  state.pageIndex = index;
  $('records').innerHTML = visible.map(row => `<tr><td>${row.appointment_id}</td><td class="nowrap">${dateFmt(row.appointment_date)}</td><td>${esc(row.department)}</td><td class="nowrap">${esc(row.doctor_short)}</td><td>№ ${row.patient_id}</td><td>${row.age}</td><td>${row.cabinet_number}</td><td>${fmt(row.wait)}</td><td>${badge(waitCategory(row.wait))}</td></tr>`).join('') || empty(9);
}
function renderWorkload() {
  if (!canView('workload')) return;
  const filters = state.period;
  const rows = model.shifts.filter(row => matchesCommon(row, row.record_date, filters));
  const critical = rows.filter(row => workloadCategory(row) === 'critical').length;
  const average = mean(rows.map(row => row.patients_count));
  $('kcards').innerHTML = [card('Смены', fmt(rows.length, 0), 'За выбранный период'), card('Средняя нагрузка', fmt(average), 'Пациентов за смену'), card('Максимальная нагрузка', rows.length ? fmt(Math.max(...rows.map(row => row.patients_count)), 0) : '–', 'Пациентов за смену'), card('Критические смены', fmt(critical, 0), 'По нормативам отделений', critical ? 'danger' : '')].join('');
  const grouped = [...groupBy(rows, 'doctor_short')].map(([name, group]) => ({ name, avg: mean(group.map(row => row.patients_count)), threshold: workloadNorms[group[0].department_id].plan })).sort((a, b) => b.avg - a.avg);
  $('workload-comparison-panel').hidden = grouped.length < 2;
  if (grouped.length > 1) bars($('kbars'), grouped, 'avg', ' чел.');
  else $('kbars').replaceChildren();
  $('workload-norms').innerHTML = data.Departments
    .map(dep => {
      const norm = workloadNorms[dep.department_id];
      return `<div><strong>${esc(dep.department_name)}</strong><small>План: ${norm.plan} · предупреждение: от ${norm.warning} · критично: от ${norm.critical}</small></div>`;
    }).join('');
  const status = $('kstatus').value;
  state.shiftRegistry = rows.filter(row => status === 'all' || workloadCategory(row) === status);
  state.shiftRegistry.sort((a, b) => $('ksort').value === 'count' ? b.patients_count - a.patients_count || b.record_date.localeCompare(a.record_date) : b.record_date.localeCompare(a.record_date) || a.doctor_id - b.doctor_id);
  const { visible, index } = paginate(state.shiftRegistry, state.shiftPage, Number($('ksize').value), 'k');
  state.shiftPage = index;
  $('krecords').innerHTML = visible.map(row => `<tr><td>${dateFmt(row.record_date)}</td><td>${esc(row.doctor)}</td><td>${esc(row.specialty)}</td><td>${row.patients_count}</td><td>${workloadNorms[row.department_id].plan}</td><td>${badge(workloadCategory(row))}</td></tr>`).join('') || empty(6);
}
function updateNavigation() {
  const links = [...document.querySelectorAll('.nav:not([hidden])')];
  if (!links.length) return;
  const sidebarHeight = document.querySelector('.sidebar').offsetHeight;
  document.documentElement.style.setProperty('--sidebar-height', `${sidebarHeight + 12}px`);
  const offset = window.innerWidth <= 650 ? sidebarHeight + 20 : 90;
  let active = links[0];
  for (const link of links) {
    if ($(link.dataset.section).getBoundingClientRect().top <= offset) active = link;
  }
  if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
    active = links.at(-1);
  }
  for (const link of links) {
    const selected = link === active;
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

function bindEvents() {
  window.addEventListener('scroll', updateNavigation, { passive: true });
  window.addEventListener('resize', updateNavigation);
  window.addEventListener('hashchange', () => {
    const section = location.hash.slice(1);
    if (section && !canView(section)) history.replaceState(null, '', `#${roles[account.role].sections[0]}`);
    updateNavigation();
  });
  for (const id of ['from', 'to']) $(id).addEventListener('change', refresh);
  $('reset-dates').onclick = resetDates;
  $('role').onchange = () => applyAccount({ ...account, role: $('role').value });
  $('account-department').onchange = () => applyAccount({ ...account, departmentId: Number($('account-department').value) });
  $('account-doctor').onchange = () => applyAccount({ ...account, doctorId: Number($('account-doctor').value) });
  $('brand-home').onclick = event => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const resetRegistry = () => { state.pageIndex = 0; renderRegistry(); };
  $('registry-department').onchange = () => { updateDoctors(); resetRegistry(); };
  $('registry-doctor').onchange = resetRegistry;
  for (const id of ['group', 'metric']) $(id).onchange = renderDashboard;
  for (const id of ['period', 'trendmetric']) $(id).onchange = renderTrend;
  $('search').oninput = () => { state.pageIndex = 0; renderRegistry(); };
  for (const id of ['sort', 'pagesize', 'wait', 'age']) $(id).onchange = () => { state.pageIndex = 0; renderRegistry(); };
  $('prev').onclick = () => { state.pageIndex--; renderRegistry(); };
  $('next').onclick = () => { state.pageIndex++; renderRegistry(); };
  for (const id of ['ksort', 'ksize', 'kstatus']) $(id).onchange = () => { state.shiftPage = 0; renderWorkload(); };
  $('kprev').onclick = () => { state.shiftPage--; renderWorkload(); };
  $('knext').onclick = () => { state.shiftPage++; renderWorkload(); };
  $('export-rows').onclick = () => canExport('registry') && downloadCSV('appointments.csv', ['ID', 'Дата', 'Отделение', 'Врач', 'Пациент ID', 'Возраст', 'Кабинет', 'Ожидание, мин', 'Статус'], state.registry.map(row => [row.appointment_id, row.appointment_date, row.department, row.doctor, row.patient_id, row.age, row.cabinet_number, row.wait, categoryLabel(waitCategory(row.wait))]));
  $('export-kpi').onclick = () => canExport('workload') && downloadCSV('workload.csv', ['Дата', 'Врач', 'Специальность', 'Пациентов', 'План', 'Статус'], state.shiftRegistry.map(row => [row.record_date, row.doctor, row.specialty, row.patients_count, workloadNorms[row.department_id].plan, categoryLabel(workloadCategory(row))]));
}
async function init() {
  try {
    sourceData = await loadData();
    const dates = prepare(sourceData);
    $('role').innerHTML = Object.entries(roles).map(([key, role]) => `<option value="${key}">${esc(role.title)}</option>`).join('');
    $('account-department').innerHTML = selectOptions(sourceData.Departments, 'department_id', row => row.department_name);
    $('account-doctor').innerHTML = selectOptions(sourceData.Doctors, 'doctor_id', fullName);
    for (const id of ['from', 'to']) {
      $(id).min = dates.minDate;
      $(id).max = dates.maxDate;
    }
    bindEvents();
    applyAccount(restoreAccount(sourceData), true);
    $('role').disabled = false;
    $('dbstatus').textContent = 'База подключена';
    $('loading').hidden = true;
    $('content').hidden = false;
    const section = location.hash.slice(1);
    if (canView(section)) {
      $(section).scrollIntoView({ behavior: 'instant' });
    }
    else if (section) history.replaceState(null, '', `#${roles[account.role].sections[0]}`);
    updateNavigation();
  } catch (error) {
    $('loading').hidden = true;
    $('error').hidden = false;
    $('error').textContent = `Не удалось загрузить данные: ${error.message}. Откройте страницу через HTTP(S).`;
    $('dbstatus').textContent = 'Нет подключения';
    console.error(error);
  }
}
init();
