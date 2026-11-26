// Роли и область доступных данных. Серверная авторизация не используется.
export const roles = {
  chief: {
    title: 'Главный врач',
    name: 'Сергей Викторович Андреев',
    avatar: 'assets/avatars/chief.webp',
    sections: ['dashboard', 'registry', 'workload'],
    export: true
  },
  head: {
    title: 'Заведующий отделением',
    name: 'Ирина Павловна Кузнецова',
    avatar: 'assets/avatars/head.webp',
    sections: ['dashboard', 'registry', 'workload'],
    export: true
  },
  doctor: {
    title: 'Врач',
    avatar: 'assets/avatars/doctor.webp',
    sections: ['registry', 'workload'],
    export: false
  }
};

export function normalizeAccount(account, data) {
  const role = Object.hasOwn(roles, account?.role) ? account.role : 'chief';
  const department = data.Departments.find(row => row.department_id === Number(account?.departmentId)) ?? data.Departments[0];
  const doctor = data.Doctors.find(row => row.doctor_id === Number(account?.doctorId)) ?? data.Doctors[0];
  return { role, departmentId: department.department_id, doctorId: doctor.doctor_id };
}

export function scopedData(data, account) {
  const doctors = data.Doctors.filter(row => {
    if (account.role === 'head') return row.department_id === account.departmentId;
    if (account.role === 'doctor') return row.doctor_id === account.doctorId;
    return true;
  });
  const doctorIds = new Set(doctors.map(row => row.doctor_id));
  const departmentIds = new Set(doctors.map(row => row.department_id));
  const appointments = data.Appointments.filter(row => doctorIds.has(row.doctor_id));
  const patientIds = new Set(appointments.map(row => row.patient_id));
  return {
    Departments: data.Departments.filter(row => departmentIds.has(row.department_id)),
    Doctors: doctors,
    Patients: data.Patients.filter(row => patientIds.has(row.patient_id)),
    Appointments: appointments,
    KPI_Records: data.KPI_Records.filter(row => doctorIds.has(row.doctor_id))
  };
}

export function restoreAccount(data) {
  let account;
  try { account = JSON.parse(localStorage.getItem('clinic-account')); } catch { /* Используем роль по умолчанию. */ }
  return normalizeAccount(account, data);
}

export function saveAccount(account) {
  try { localStorage.setItem('clinic-account', JSON.stringify(account)); } catch { /* Смена роли работает и без сохранения. */ }
}
