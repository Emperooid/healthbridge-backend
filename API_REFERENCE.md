# HealthBridge API Reference

> **Base URL:** `https://healthbridge-backend-65sj.onrender.com/api/v1`
> **Swagger / Interactive Docs:** `https://healthbridge-backend-65sj.onrender.com/api/docs`

---

## Authentication

All endpoints (except `register`, `login`, `refresh`, and public share resolve) require:
```
Authorization: Bearer <accessToken>
```

- `accessToken` expires in **15 minutes**
- `refreshToken` expires in **7 days**
- When you get a `401`, call `/auth/refresh` to get a new token pair

---

## Standard Response Format

Every response is wrapped in this envelope:
```json
{
  "statusCode": 200,
  "message": "Success",
  "data": { ... },
  "timestamp": "2026-06-11T10:00:00.000Z"
}
```

Error response:
```json
{
  "statusCode": 400,
  "timestamp": "2026-06-11T10:00:00.000Z",
  "path": "/api/v1/auth/login",
  "message": "Invalid credentials"
}
```

---

## Pagination

All list endpoints accept:
| Param | Default | Max | Description |
|---|---|---|---|
| `page` | `1` | — | Page number |
| `limit` | `10` | `100` | Items per page |

Paginated responses include a `meta` object:
```json
{
  "data": [...],
  "meta": { "total": 100, "page": 1, "limit": 10, "pages": 10 }
}
```

---

## Rate Limiting

**100 requests per 60 seconds** per IP. Returns `429 Too Many Requests` when exceeded.

---

## Axios Setup (copy-paste ready)

```js
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://healthbridge-backend-65sj.onrender.com/api/v1',
});

// Attach token automatically
api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true;
      const { data } = await api.post('/auth/refresh', {
        refreshToken: localStorage.getItem('refreshToken'),
      });
      localStorage.setItem('accessToken', data.data.accessToken);
      localStorage.setItem('refreshToken', data.data.refreshToken);
      err.config.headers.Authorization = `Bearer ${data.data.accessToken}`;
      return api(err.config);
    }
    return Promise.reject(err);
  }
);

export default api;
```

---

---

# Endpoints

---

## 🔐 Auth — `/auth`

### Register
```
POST /auth/register
```
Body:
```json
{
  "email": "jane@hospital.com",
  "password": "StrongP@ss1",
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "+2348012345678",
  "role": "DOCTOR"
}
```
> `role` defaults to `"PATIENT"`. Options: `"ADMIN"` | `"DOCTOR"` | `"PATIENT"`

Response `201`:
```json
{
  "data": {
    "user": { "id": "uuid", "email": "...", "firstName": "Jane", "lastName": "Smith", "role": "DOCTOR" },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

---

### Login
```
POST /auth/login
```
Body:
```json
{
  "email": "jane@hospital.com",
  "password": "StrongP@ss1"
}
```
Response `200`:
```json
{
  "data": {
    "user": { "id": "uuid", "email": "...", "firstName": "Jane", "role": "DOCTOR" },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

---

### Refresh Token
```
POST /auth/refresh
```
Body:
```json
{ "refreshToken": "eyJhbGci..." }
```
Response `200` — returns a new `accessToken` + `refreshToken` pair.

---

### Logout
```
POST /auth/logout
Authorization: Bearer <accessToken>
```
Body *(optional)*:
```json
{ "refreshToken": "eyJhbGci..." }
```
> Omit body to revoke **all** sessions. Provide `refreshToken` to revoke only the current session.

Response `200`:
```json
{ "data": { "message": "Logged out successfully" } }
```

---

### Get Current User
```
GET /auth/me
Authorization: Bearer <accessToken>
```
Response: Full user object including linked `patient` or `doctor` profile IDs.

---

---

## 👤 Users — `/users`
*(Admin only except GET own profile)*

### Create User
```
POST /users
```
Body:
```json
{
  "email": "newuser@example.com",
  "password": "StrongP@ss1",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+2348000000000",
  "role": "PATIENT"
}
```

---

### List Users *(Admin)*
```
GET /users?page=1&limit=10
```

---

### Get User by ID
```
GET /users/:id
```

---

### Update User Profile
```
PATCH /users/:id
```
Body (all optional):
```json
{
  "firstName": "Updated",
  "lastName": "Name",
  "phone": "+2348099999999"
}
```
> Patients/Doctors can only update their own profile.

---

### Change User Role *(Admin)*
```
PATCH /users/:id/role
```
Body:
```json
{ "role": "DOCTOR" }
```

---

### Activate / Deactivate User *(Admin)*
```
PATCH /users/:id/status
```
Body:
```json
{ "isActive": false }
```

---

### Delete User *(Admin)*
```
DELETE /users/:id
```

---

---

## 🏥 Hospitals — `/hospitals`

### Create Hospital *(Admin)*
```
POST /hospitals
```
Body:
```json
{
  "name": "Lagos General Hospital",
  "address": "1 Hospital Road, Lagos",
  "phone": "+2341234567",
  "email": "info@lgh.ng"
}
```

---

### List Hospitals
```
GET /hospitals?page=1&limit=10
```

---

### Get Hospital
```
GET /hospitals/:id
```

---

### Update Hospital *(Admin)*
```
PATCH /hospitals/:id
```
Body (all optional):
```json
{ "name": "New Name", "address": "New Address", "isActive": true }
```

---

### Delete Hospital *(Admin)*
```
DELETE /hospitals/:id
```

---

### Assign Doctor to Hospital *(Admin)*
```
POST /hospitals/:id/doctors
```
Body:
```json
{
  "userId": "uuid-of-user-with-DOCTOR-role",
  "specialization": "Cardiology",
  "licenseNumber": "LMC-2024-001"
}
```
> User must already have `role: "DOCTOR"`. Set via `PATCH /users/:id/role` first.

---

### List Hospital Doctors
```
GET /hospitals/:id/doctors?page=1&limit=10
```

---

### Create Department *(Admin)*
```
POST /hospitals/:id/departments
```
Body:
```json
{
  "name": "Cardiology",
  "description": "Heart and cardiovascular care"
}
```

---

### List Hospital Departments
```
GET /hospitals/:id/departments
```
Response: Array of departments for the given hospital.

---

### Update Department *(Admin)*
```
PATCH /hospitals/departments/:departmentId
```
Body (all optional):
```json
{ "name": "Updated Name", "description": "Updated description" }
```

---

### Delete Department *(Admin)*
```
DELETE /hospitals/departments/:departmentId
```
> Soft-deletes (sets `isActive: false`). The department won't appear in list results.

---

---

## 🧑‍⚕️ Patients — `/patients`

### Create Patient Profile
```
POST /patients
```
Body:
```json
{
  "userId": "uuid-of-user-with-PATIENT-role",
  "hospitalId": "uuid-of-hospital",
  "dateOfBirth": "1990-06-15",
  "gender": "MALE",
  "bloodType": "O+",
  "allergies": ["Penicillin", "Aspirin"],
  "emergencyContact": "Jane Doe: +2348098765432"
}
```

---

### List Patients
```
GET /patients?page=1&limit=10
```
> **Admin/Doctor** — all patients. **Patient** — own profile only.

---

### Get My Patient Profile *(Patient)*
```
GET /patients/me
```
Returns your patient profile with the last 5 records.

---

### Get Patient by ID
```
GET /patients/:id
```
> Patients can only access their own record.

---

### Update Patient
```
PATCH /patients/:id
```
Body (all optional):
```json
{
  "bloodType": "A+",
  "allergies": ["Penicillin"],
  "emergencyContact": "New Contact",
  "assignedDoctorId": "uuid-of-doctor-profile"
}
```

---

### Delete Patient *(Admin)*
```
DELETE /patients/:id
```

---

---

## 🏃 Visits & Encounters — `/encounters`

Visits represent a patient physically attending the hospital. Encounters are the clinical notes recorded during a visit.

### Start a Visit *(Doctor, Admin)*
```
POST /encounters/visits
```
Body:
```json
{
  "patientId": "uuid-of-patient-profile",
  "doctorId": "uuid-of-doctor-profile",
  "hospitalId": "uuid-of-hospital",
  "departmentId": "uuid-of-department",
  "reason": "Chest pain and shortness of breath",
  "startTime": "2026-06-11T09:00:00.000Z"
}
```
> `departmentId` and `startTime` are optional.

---

### List Visits
```
GET /encounters/visits?page=1&limit=10&patientId=uuid&doctorId=uuid&status=IN_PROGRESS
```
> `status` options: `"IN_PROGRESS"` | `"COMPLETED"` | `"CANCELLED"`
> **Admin** — all visits. **Doctor** — own visits. **Patient** — own visits.

---

### Get Visit (with encounters, prescriptions, lab orders)
```
GET /encounters/visits/:id
```

---

### Update Visit Status *(Doctor, Admin)*
```
PATCH /encounters/visits/:id
```
Body:
```json
{
  "status": "COMPLETED",
  "endTime": "2026-06-11T10:30:00.000Z"
}
```
> Setting `status: "COMPLETED"` auto-sets `endTime` to now if not provided.

---

### Add Encounter Note to a Visit *(Doctor, Admin)*
```
POST /encounters/notes
```
Body:
```json
{
  "visitId": "uuid-of-visit",
  "chiefComplaint": "Chest pain radiating to the left arm",
  "examination": "Regular heartbeat, no murmurs detected",
  "diagnosis": "Possible angina — needs further investigation",
  "notes": "Refer for ECG and stress test",
  "vitalSigns": {
    "temperature": "37.2°C",
    "bloodPressure": "120/80",
    "pulse": "72bpm",
    "weight": "75kg",
    "height": "178cm"
  }
}
```
> Can only add notes to an `IN_PROGRESS` visit.

---

### Get All Notes for a Visit
```
GET /encounters/visits/:visitId/notes
```

---

### Update an Encounter Note *(Doctor, Admin)*
```
PATCH /encounters/notes/:id
```
Body (all optional):
```json
{
  "diagnosis": "Confirmed angina",
  "notes": "Started on nitrates",
  "vitalSigns": { "bloodPressure": "118/76" }
}
```

---

---

## 📋 Medical Records — `/records`

### Create Record *(Doctor, Admin)*
```
POST /records
```
Body:
```json
{
  "patientId": "uuid-of-patient-profile",
  "doctorId": "uuid-of-doctor-profile",
  "hospitalId": "uuid-of-hospital",
  "title": "Annual Check-up",
  "description": "Patient presented with mild hypertension.",
  "diagnosis": "Hypertension Stage 1",
  "treatment": "Lifestyle changes and monitoring",
  "prescription": "Amlodipine 5mg daily",
  "status": "ACTIVE",
  "visitDate": "2026-06-01T09:00:00.000Z"
}
```
> `status` options: `"DRAFT"` | `"ACTIVE"` | `"ARCHIVED"`

---

### List Records
```
GET /records?page=1&limit=10
```
> **Admin** — all. **Doctor** — records they created. **Patient** — own records.

---

### Get My Records *(Patient)*
```
GET /records/mine?page=1&limit=10
```

---

### Get Records for a Patient
```
GET /records/patient/:patientId?page=1&limit=10
```

---

### Get Record by ID
```
GET /records/:id
```

---

### Update Record *(Doctor, Admin)*
```
PATCH /records/:id
```
Body (all optional):
```json
{
  "diagnosis": "Updated diagnosis",
  "treatment": "New treatment plan",
  "status": "ARCHIVED"
}
```

---

### Delete Record *(Admin)*
```
DELETE /records/:id
```

---

---

## 💊 Prescriptions — `/prescriptions`

### Issue a Prescription *(Doctor, Admin)*
```
POST /prescriptions
```
Body:
```json
{
  "patientId": "uuid-of-patient-profile",
  "doctorId": "uuid-of-doctor-profile",
  "hospitalId": "uuid-of-hospital",
  "visitId": "uuid-of-visit",
  "drug": "Amoxicillin",
  "dosage": "500mg",
  "frequency": "Twice daily",
  "duration": "7 days",
  "instructions": "Take after meals"
}
```
> `visitId` is optional but recommended to link to a specific visit.
> Patient receives a notification when a prescription is issued.

---

### List Prescriptions
```
GET /prescriptions?page=1&limit=10&patientId=uuid&status=ACTIVE
```
> `status` options: `"ACTIVE"` | `"COMPLETED"` | `"CANCELLED"`
> **Admin** — all. **Doctor** — own. **Patient** — own.

---

### Get My Prescriptions
```
GET /prescriptions/mine?page=1&limit=10
```
> Works for both patients and doctors.

---

### Get Prescription by ID
```
GET /prescriptions/:id
```

---

### Update Prescription *(Doctor, Admin)*
```
PATCH /prescriptions/:id
```
Body (all optional):
```json
{
  "status": "COMPLETED",
  "dosage": "250mg",
  "instructions": "Updated instructions"
}
```

---

---

## 🧪 Lab Orders & Results — `/labs`

### Create Lab Order *(Doctor, Admin)*
```
POST /labs/orders
```
Body:
```json
{
  "patientId": "uuid-of-patient-profile",
  "doctorId": "uuid-of-doctor-profile",
  "hospitalId": "uuid-of-hospital",
  "visitId": "uuid-of-visit",
  "tests": ["Full Blood Count", "Liver Function Test", "Fasting Blood Sugar"],
  "notes": "Patient must fast for 8 hours before sample collection"
}
```
> `visitId` and `notes` are optional.
> Patient receives a notification when a lab order is created.

---

### List Lab Orders
```
GET /labs/orders?page=1&limit=10&patientId=uuid&status=PENDING
```
> `status` options: `"PENDING"` | `"IN_PROGRESS"` | `"COMPLETED"` | `"CANCELLED"`

---

### Get Lab Order (with results)
```
GET /labs/orders/:id
```
Returns the order plus all attached results.

---

### Update Lab Order Status *(Admin)*
```
PATCH /labs/orders/:id
```
Body:
```json
{ "status": "CANCELLED" }
```

---

### Post Lab Result *(Admin)*
```
POST /labs/results
```
Body:
```json
{
  "orderId": "uuid-of-lab-order",
  "testName": "Haemoglobin",
  "value": "14.5",
  "unit": "g/dL",
  "referenceRange": "13.5 - 17.5 g/dL",
  "isAbnormal": false,
  "notes": "Within normal range",
  "reportFile": "s3://bucket/reports/lab-001.pdf"
}
```
> Both patient and doctor are notified when a result is posted.
> Order auto-advances: `PENDING → IN_PROGRESS` on first result, `IN_PROGRESS → COMPLETED` when all tests have results.

---

### Get Results for an Order
```
GET /labs/orders/:orderId/results
```

---

---

## 📅 Appointments — `/appointments`

### Book Appointment *(Patient, Admin)*
```
POST /appointments
```
Body:
```json
{
  "patientId": "uuid-of-patient-profile",
  "doctorId": "uuid-of-doctor-profile",
  "hospitalId": "uuid-of-hospital",
  "title": "General Checkup",
  "reason": "Routine annual checkup",
  "type": "CONSULTATION",
  "scheduledAt": "2026-07-10T10:00:00.000Z",
  "durationMinutes": 30,
  "notes": "Patient has mild anxiety"
}
```
> `type` options: `"CONSULTATION"` | `"FOLLOW_UP"` | `"LAB_REVIEW"` | `"PROCEDURE"` | `"EMERGENCY"`
> Both patient and doctor receive a notification on booking.

---

### List Appointments
```
GET /appointments?page=1&limit=10&status=PENDING&from=2026-07-01&to=2026-07-31
```
> Filter params: `status`, `patientId`, `doctorId`, `from`, `to`

---

### Get My Appointments *(Patient or Doctor)*
```
GET /appointments/mine?page=1&limit=10
```

---

### Get Appointment by ID
```
GET /appointments/:id
```

---

### Update Appointment *(Doctor, Admin)*
```
PATCH /appointments/:id
```
Body (all optional):
```json
{
  "scheduledAt": "2026-07-11T11:00:00.000Z",
  "notes": "Rescheduled",
  "durationMinutes": 45
}
```

---

### Update Appointment Status *(Doctor, Admin)*
```
PATCH /appointments/:id/status
```
Body:
```json
{ "status": "CONFIRMED" }
```
Valid transitions:
- `PENDING` → `CONFIRMED` or `CANCELLED`
- `CONFIRMED` → `COMPLETED`, `NO_SHOW`, or `CANCELLED`

> Patient is notified when status changes to `CONFIRMED`.

---

### Cancel Appointment
```
PATCH /appointments/:id/cancel
```
> Patients can cancel their own. Doctors and Admins can cancel any.

---

### Delete Appointment *(Admin)*
```
DELETE /appointments/:id
```

---

---

## 🔔 Notifications — `/notifications`

### List My Notifications
```
GET /notifications?page=1&limit=10
```

---

### Get Unread Count
```
GET /notifications/unread-count
```
Response:
```json
{ "data": { "count": 5 } }
```

---

### Mark Notification as Read
```
PATCH /notifications/:id/read
```

---

### Mark All as Read
```
PATCH /notifications/read-all
```

---

### Delete Notification
```
DELETE /notifications/:id
```

---

---

## 🔗 Record Sharing — `/share`

### Generate a Share Link *(Patient)*
```
POST /share/links
```
Body:
```json
{
  "scope": "ALL",
  "expiresInHours": 48,
  "maxAccess": 5
}
```
> `scope` options: `"ALL"` | `"RECORDS"` | `"LABS"` | `"PRESCRIPTIONS"`
> `maxAccess` is optional — limits total number of times the link can be opened.

Response includes a `token` field. The share URL is:
```
GET /share/resolve/:token  (no auth required)
```

---

### List My Share Links *(Patient)*
```
GET /share/links
```

---

### Revoke a Share Link *(Patient)*
```
PATCH /share/links/:id/revoke
```

---

### Get QR Code for a Share Link *(Patient)*
```
GET /share/links/:id/qr
Authorization: Bearer <accessToken>
```
Response:
```json
{ "data": "data:image/png;base64,iVBORw0KGg..." }
```
> Render directly in an `<img src="...">` tag.

---

### Resolve Share Token *(Public — no auth)*
```
GET /share/resolve/:token
```
Returns the patient's shared data based on the link's scope. Increments access count.

---

### Grant Access to a User *(Patient)*
```
POST /share/grants
```
Body:
```json
{
  "grantedToEmail": "doctor@hospital.com",
  "scope": "ALL",
  "expiresInDays": 30
}
```
> `expiresInDays` is optional — omit for permanent access until revoked.

---

### List My Access Grants *(Patient)*
```
GET /share/grants
```

---

### Revoke an Access Grant *(Patient)*
```
PATCH /share/grants/:id/revoke
```

---

---

## 📊 Analytics — `/analytics`
*(Admin only)*

### System Overview
```
GET /analytics/overview
```
Response:
```json
{
  "data": {
    "totalPatients": 142,
    "totalDoctors": 18,
    "totalHospitals": 3,
    "totalRecords": 520,
    "totalAppointments": 310,
    "totalLabOrders": 87,
    "totalPrescriptions": 204,
    "totalVisits": 290
  }
}
```

---

### Patient Statistics
```
GET /analytics/patients
```
Returns total, new this month vs last month, growth rate, breakdown by gender and blood type.

---

### Appointment Statistics
```
GET /analytics/appointments
```
Returns total, upcoming, breakdown by status.

---

### Medical Record Statistics
```
GET /analytics/records
```
Returns total, created this month, breakdown by status.

---

### Hospital Utilization
```
GET /analytics/hospitals
```
Returns per-hospital counts of patients, doctors, appointments, records, departments.

---

### Lab Statistics
```
GET /analytics/labs
```
Returns total orders, abnormal result count, breakdown by status.

---

### Prescription Statistics
```
GET /analytics/prescriptions
```
Returns total, issued this month, breakdown by status.

---

---

## 📎 Files — `/files`
> Requires AWS S3 configured on the server.

### Upload File to a Record *(Doctor, Admin)*
```
POST /files/upload/:recordId
Content-Type: multipart/form-data
```
Form field: `file`

Allowed types: JPEG, PNG, GIF, PDF, DOC, DOCX — max **10 MB**

---

### List Files for a Record
```
GET /files/record/:recordId
```

---

### Get Pre-signed Download URL
```
GET /files/:id/url
```
Response:
```json
{ "data": { "url": "https://s3.amazonaws.com/...?X-Amz-Signature=..." } }
```
> URL expires in 1 hour. Use directly in `<img src>` or `<a href>`.

---

### Download File (stream)
```
GET /files/:id/download
```

---

### Delete File *(Doctor, Admin)*
```
DELETE /files/:id
```

---

---

## 📝 Audit Logs — `/audit`
*(Admin only)*

### List All Audit Logs
```
GET /audit?page=1&limit=10
```

### Logs for a Specific User
```
GET /audit/user/:userId?page=1&limit=10
```

---

---

## Role Permissions Summary

| Resource | ADMIN | DOCTOR | PATIENT |
|---|:---:|:---:|:---:|
| Register / Login / Logout | ✅ | ✅ | ✅ |
| Manage users (create, role, status, delete) | ✅ | ❌ | ❌ |
| Create / delete hospital | ✅ | ❌ | ❌ |
| View hospitals | ✅ | ✅ | ✅ |
| Manage departments | ✅ | ❌ | ❌ |
| Create patient profile | ✅ | ✅ | ✅ |
| View any patient | ✅ | ✅ | ❌ |
| View own patient profile | ✅ | ✅ | ✅ |
| Start / update visit | ✅ | ✅ | ❌ |
| View visits | ✅ | ✅ (own) | ✅ (own) |
| Add encounter notes | ✅ | ✅ | ❌ |
| Create medical record | ✅ | ✅ | ❌ |
| View medical records | ✅ | ✅ (own) | ✅ (own) |
| Issue prescription | ✅ | ✅ | ❌ |
| View prescriptions | ✅ | ✅ (own) | ✅ (own) |
| Create lab order | ✅ | ✅ | ❌ |
| Post lab result | ✅ | ❌ | ❌ |
| View lab orders & results | ✅ | ✅ (own) | ✅ (own) |
| Book appointment | ✅ | ❌ | ✅ (own) |
| Confirm / complete appointment | ✅ | ✅ | ❌ |
| Cancel appointment | ✅ | ✅ | ✅ (own) |
| Upload / delete files | ✅ | ✅ | ❌ |
| View files | ✅ | ✅ (own) | ✅ (own) |
| Generate share links / grants | ❌ | ❌ | ✅ |
| View analytics | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ❌ | ❌ |

---

---

## Typical Frontend Flow

```
1.  Register user            POST /auth/register
2.  Login                    POST /auth/login  →  save accessToken + refreshToken
3.  Attach to all requests   Authorization: Bearer <accessToken>
4.  Token expired (401)?     POST /auth/refresh  →  save new pair
5.  Logout                   POST /auth/logout

── Patient flow ──────────────────────────────────────────────────────
6.  Create patient profile   POST /patients
7.  View dashboard           GET  /patients/me
8.  View records             GET  /records/mine
9.  Book appointment         POST /appointments
10. Share records            POST /share/links  →  share the token URL

── Doctor flow ────────────────────────────────────────────────────────
6.  Doctor assigned to hosp  POST /hospitals/:id/doctors  (Admin does this)
7.  Start a visit            POST /encounters/visits
8.  Add encounter notes      POST /encounters/notes
9.  Issue prescription       POST /prescriptions
10. Order lab tests          POST /labs/orders
11. View lab results         GET  /labs/orders/:orderId/results

── Admin flow ─────────────────────────────────────────────────────────
6.  Create hospital          POST /hospitals
7.  Add departments          POST /hospitals/:id/departments
8.  Assign doctors           POST /hospitals/:id/doctors
9.  View analytics           GET  /analytics/overview
10. View audit trail         GET  /audit
```
