const DB_NAME = 'clinic_analytics_v5_expanded';
const stores = {
  Departments: ['department_id', {}],
  Doctors: ['doctor_id', { department_id: false, snils: true }],
  Patients: ['patient_id', { snils: true }],
  Appointments: ['appointment_id', { patient_id: false, doctor_id: false, appointment_date: false }],
  KPI_Records: ['kpi_id', { doctor_id: false, record_date: false }]
};

export function validate(data) {
  for (const [table, [key]] of Object.entries(stores)) {
    if (!Array.isArray(data[table])) throw new Error(`Нет таблицы ${table}`);
    const ids = data[table].map(row => row[key]);
    if (ids.some(id => !Number.isInteger(id)) || new Set(ids).size !== ids.length) {
      throw new Error(`Некорректные ключи: ${table}`);
    }
  }
  const ids = (table, key) => new Set(data[table].map(row => row[key]));
  const departments = ids('Departments', 'department_id');
  const doctors = ids('Doctors', 'doctor_id');
  const patients = ids('Patients', 'patient_id');
  if (data.Doctors.some(row => !departments.has(row.department_id)) ||
      data.Appointments.some(row => !doctors.has(row.doctor_id) || !patients.has(row.patient_id) ||
        (row.waiting_time !== null && (!Number.isFinite(row.waiting_time) || row.waiting_time < 0))) ||
      data.KPI_Records.some(row => !doctors.has(row.doctor_id) || !Number.isInteger(row.patients_count) || row.patients_count < 0)) {
    throw new Error('Некорректные связи или значения в базе');
  }
}

async function loadSeed() {
  const response = await fetch(new URL('../data/clinic.json', import.meta.url));
  if (!response.ok) throw new Error('Не удалось загрузить данные');
  const data = await response.json();
  validate(data);
  return data;
}

function openDatabase(seed) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      for (const [table, [keyPath, indexes]] of Object.entries(stores)) {
        const store = request.result.createObjectStore(table, { keyPath });
        for (const [key, unique] of Object.entries(indexes)) {
          store.createIndex(key, key, { unique });
        }
        for (const row of seed[table]) store.add(row);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Закройте другие вкладки приложения'));
  });
}

function readDatabase(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(Object.keys(stores), 'readonly');
    const data = {};
    for (const table of Object.keys(stores)) {
      const request = transaction.objectStore(table).getAll();
      request.onsuccess = () => { data[table] = request.result; };
    }
    transaction.oncomplete = () => resolve(data);
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}

export async function loadData() {
  const seed = await loadSeed();
  const db = await openDatabase(seed);
  try {
    const data = await readDatabase(db);
    validate(data);
    return data;
  } finally {
    db.close();
  }
}
