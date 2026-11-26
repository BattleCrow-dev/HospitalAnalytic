-- Практическая №5: экспорт датасета для Python и VS Code.
-- Сначала запустить 01_add_data.sql и 03_expand_data.sql один раз на БД из практической №3.
USE bipit_practice3_demo;

-- Данные о приёмах, отделениях и возрасте пациентов.
-- Результат: 1500 строк, числовые / категориальные / дата.
-- В Workbench: Result Grid -> Export -> CSV -> сохранить как data.csv.
SELECT
    a.appointment_id,
    a.appointment_date,
    dep.department_name AS department,
    CONCAT_WS(' ', d.last_name, d.first_name, d.patronymic) AS doctor_name,
    d.specialty,
    a.cabinet_number,
    a.waiting_time,
    a.patient_id,
    a.doctor_id,
    TIMESTAMPDIFF(YEAR, p.birth_date, a.appointment_date) AS patient_age
FROM Appointments AS a
JOIN Patients AS p ON p.patient_id = a.patient_id
JOIN Doctors AS d ON d.doctor_id = a.doctor_id
JOIN Departments AS dep ON dep.department_id = d.department_id
ORDER BY a.appointment_id
;

-- Дополнительно: буквальная форма SELECT * FROM ... LIMIT 500
-- применима к отдельной таблице (напр. Appointments),
-- но для группировки по отделениям мы используем приведённый JOIN.
