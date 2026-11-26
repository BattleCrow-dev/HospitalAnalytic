export const categories = [
  ['normal', 'Норма', '#23866c'],
  ['above', 'Выше плана', '#8296b1'],
  ['warning', 'Предупреждение', '#d79a38'],
  ['critical', 'Критично', '#d05a5e']
];

export const fullName = doctor => [doctor.last_name, doctor.first_name, doctor.patronymic].filter(Boolean).join(' ');
export const shortName = doctor => `${doctor.last_name} ${doctor.first_name[0]}. ${doctor.patronymic ? doctor.patronymic[0] + '.' : ''}`;
export const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
export function waitCategory(value) {
  if (value < 15) return 'normal';
  if (value < 20) return 'above';
  if (value < 30) return 'warning';
  return 'critical';
}
// Внутренние плановые показатели пациентов за смену по отделениям.
export const workloadNorms = {
  1: { plan: 25, warning: 30, critical: 35 },
  2: { plan: 20, warning: 24, critical: 28 },
  3: { plan: 18, warning: 22, critical: 26 }
};
export function workloadCategory(row) {
  const norm = workloadNorms[row.department_id];
  if (row.patients_count >= norm.critical) return 'critical';
  if (row.patients_count >= norm.warning) return 'warning';
  if (row.patients_count > norm.plan) return 'above';
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
    wait: row.waiting_time
  }));
  const shifts = data.KPI_Records.map(row => ({ ...row, ...doctorFields(row.doctor_id) }));
  const dates = [...appointments.map(row => row.appointment_date), ...shifts.map(row => row.record_date)].sort();
  return { appointments, shifts, minDate: dates[0], maxDate: dates.at(-1) };
}
export function matchesCommon(row, date, filters) {
  return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to) &&
    (filters.department === 'all' || String(row.department_id) === filters.department) &&
    (filters.doctor === 'all' || String(row.doctor_id) === filters.doctor);
}
export function filterAppointments(rows, filters) {
  return rows.filter(row => matchesCommon(row, row.appointment_date, filters));
}
export function metrics(rows) {
  const values = rows.map(row => row.wait);
  return {
    count: rows.length, avg: mean(values), known: values.length,
    critical: values.filter(value => value >= 30).length
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
