CREATE TABLE Departments (
    department_id INT AUTO_INCREMENT PRIMARY KEY,
    department_name VARCHAR(100) NOT NULL
);
CREATE TABLE Doctors (
    doctor_id INT AUTO_INCREMENT PRIMARY KEY,
    last_name VARCHAR(50) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    patronymic VARCHAR(50),
    snils VARCHAR(14) UNIQUE,
    specialty VARCHAR(100),
    department_id INT,
    FOREIGN KEY (department_id) REFERENCES Departments(department_id)
);
CREATE TABLE Patients (
    patient_id INT AUTO_INCREMENT PRIMARY KEY,
    last_name VARCHAR(50) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    patronymic VARCHAR(50),
    birth_date DATE,
    oms_policy VARCHAR(16),
    snils VARCHAR(14) UNIQUE,
    phone VARCHAR(20)
);
CREATE TABLE Appointments (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT,
    doctor_id INT,
    appointment_date DATE,
    cabinet_number INT,
    waiting_time INT,
    FOREIGN KEY (patient_id) REFERENCES Patients(patient_id),
    FOREIGN KEY (doctor_id) REFERENCES Doctors(doctor_id)
);
CREATE TABLE KPI_Records (
    kpi_id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT,
    record_date DATE,
    patients_count INT,
    FOREIGN KEY (doctor_id) REFERENCES Doctors(doctor_id)
);

INSERT INTO Departments (department_name) VALUES
('Терапевтическое отделение'),
('Кардиологическое отделение'),
('Хирургическое отделение');

INSERT INTO Doctors (last_name, first_name, patronymic, snils, specialty, department_id) VALUES
('Иванов', 'Иван', 'Иванович', '123-456-789 01', 'Врач-терапевт', 1),
('Петрова', 'Анна', 'Сергеевна', '123-456-789 02', 'Врач-терапевт', 1),
('Сидоров', 'Петр', 'Алексеевич', '123-456-789 03', 'Врач-кардиолог', 2),
('Смирнова', 'Елена', 'Владимировна', '123-456-789 04', 'Врач-кардиолог', 2),
('Кузнецов', 'Дмитрий', 'Николаевич', '123-456-789 05', 'Врач-хирург', 3);

INSERT INTO Patients (last_name, first_name, patronymic, birth_date, oms_policy, snils, phone) VALUES
('Соколов', 'Алексей', 'Викторович', '1980-05-15', '7700000000000001', '111-222-333 01', '+7-999-111-22-33'),
('Морозова', 'Ольга', 'Дмитриевна', '1992-08-20', '7700000000000002', '111-222-333 02', '+7-999-222-33-44'),
('Волков', 'Сергей', 'Андреевич', '1975-12-01', '7700000000000003', '111-222-333 03', '+7-999-333-44-55'),
('Зайцева', 'Мария', 'Игоревна', '2000-03-10', '7700000000000004', '111-222-333 04', '+7-999-444-55-66'),
('Павлов', 'Николай', 'Петрович', '1965-11-25', '7700000000000005', '111-222-333 05', '+7-999-555-66-77');

INSERT INTO Appointments (patient_id, doctor_id, appointment_date, cabinet_number, waiting_time) VALUES
(1, 1, '2026-10-10', 201, 35),
(2, 1, '2026-10-10', 201, 40),
(3, 2, '2026-10-10', 202, 10),
(4, 3, '2026-10-10', 305, 25),
(5, 4, '2026-10-10', 306, 5);

INSERT INTO KPI_Records (doctor_id, record_date, patients_count) VALUES
(1, '2026-10-10', 38),
(2, '2026-10-10', 24),
(3, '2026-10-10', 26),
(4, '2026-10-10', 20),
(1, '2026-10-11', 36);