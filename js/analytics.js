export const categories = [
  ['normal', 'Норма', '#23866c'],
  ['above', 'Выше плана', '#8296b1'],
  ['warning', 'Предупреждение', '#d79a38'],
  ['critical', 'Критично', '#d05a5e'],
  ['missing', 'Без данных', '#c8cfd8']
];

export const fullName = doctor => [doctor.last_name, doctor.first_name, doctor.patronymic].filter(Boolean).join(' ');
export const shortName = doctor => `${doctor.last_name} ${doctor.first_name[0]}. ${doctor.patronymic ? doctor.patronymic[0] + '.' : ''}`;
export const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
export function waitCategory(value) {
  if (value === null) return 'missing';
  if (value < 15) return 'normal';
  if (value < 20) return 'above';
  if (value < 30) return 'warning';
  return 'critical';
}
export function workloadCategory(row) {
  if (row.specialty !== 'Врач-терапевт') return 'missing';
  if (row.patients_count >= 35) return 'critical';
  if (row.patients_count >= 30) return 'warning';
  if (row.patients_count > 25) return 'above';
  return 'normal';
}

function ageAt(birth, date) {
  return Number(date.slice(0, 4)) - Number(birth.slice(0, 4)) - (date.slice(5) < birth.slice(5) ? 1 : 0);
}
export function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const name = typeof key === 'function' ? key(row) : row[key];
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return groups;
}
export function prepare(data) {
  const departments = new Map(data.Departments.map(row => [row.department_id, row]));
  const doctors = new Map(data.Doctors.map(row => [row.doctor_id, row]));
  const patients = new Map(data.Patients.map(row => [row.patient_id, row]));
  const daily = groupBy(data.Appointments, row => `${row.doctor_id}|${row.appointment_date}`);
  const values = data.Appointments.map(row => row.waiting_time).filter(value => value !== null).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length ? (values[middle] + values[Math.floor((values.length - 1) / 2)]) / 2 : null;
  const doctorFields = id => {
    const doctor = doctors.get(id);
    return {
      department_id: doctor.department_id,
      department: departments.get(doctor.department_id).department_name,
      doctor: fullName(doctor), doctor_short: shortName(doctor), specialty: doctor.specialty
    };
  };
  const appointments = data.Appointments.map(row => ({
    ...row, ...doctorFields(row.doctor_id),
    age: ageAt(patients.get(row.patient_id).birth_date, row.appointment_date),
    daily_count: daily.get(`${row.doctor_id}|${row.appointment_date}`).length
  }));
  const shifts = data.KPI_Records.map(row => ({ ...row, ...doctorFields(row.doctor_id) }));
  const dates = [...appointments.map(row => row.appointment_date), ...shifts.map(row => row.record_date)].sort();
  return { appointments, shifts, median, minDate: dates[0], maxDate: dates.at(-1) };
}
export function matchesCommon(row, date, filters) {
  return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to) &&
    (filters.department === 'all' || String(row.department_id) === filters.department) &&
    (filters.doctor === 'all' || String(row.doctor_id) === filters.doctor);
}
export function filterAppointments(rows, filters, median) {
  return rows.map(row => ({ ...row, wait: row.waiting_time ?? (filters.impute ? median : null) }))
    .filter(row => matchesCommon(row, row.appointment_date, filters) &&
      (filters.wait === 'all' || (filters.wait === 'missing' ? row.waiting_time === null : waitCategory(row.wait) === filters.wait)) &&
      (filters.age === 'all' || (filters.age === 'senior' ? row.age >= 60 : row.age < 60)));
}
export function metrics(rows) {
  const values = rows.map(row => row.wait).filter(value => value !== null);
  return {
    count: rows.length, avg: mean(values), known: values.length,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    critical: values.filter(value => value >= 30).length,
    missing: rows.filter(row => row.waiting_time === null).length
  };
}
export function aggregate(rows, key) {
  return [...groupBy(rows, key)].map(([name, group]) => ({ name, ...metrics(group) }));
}
export function periodKey(date, period) {
  if (period === 'month') return date.slice(0, 7);
  if (period === 'day') return date;
  const monday = new Date(`${date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return monday.toISOString().slice(0, 10);
}
export function trend(rows, period, metric) {
  return [...groupBy(rows, row => periodKey(row.appointment_date, period))]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => ({ date, value: metrics(group)[metric] }))
    .filter(row => row.value !== null);
}
export function correlation(a, b) {
  if (a.length < 2) return null;
  const ma = mean(a), mb = mean(b);
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    ab += x * y; aa += x * x; bb += y * y;
  }
  return aa && bb ? Math.max(-1, Math.min(1, ab / Math.sqrt(aa * bb))) : null;
}
