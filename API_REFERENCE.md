# HealthBridge API Reference
> For frontend integration. Base URL: `http://localhost:3000/api/v1`
> Interactive docs (Swagger UI): `http://localhost:3000/api/docs`

---

## Before You Start — Setup Checklist

Copy `.env.example` to `.env` and fill in the values below:

```env
# ── REQUIRED ──────────────────────────────────────
DATABASE_URL=postgresql://postgres:password@localhost:5432/healthbridge

JWT_ACCESS_SECRET=any-long-random-string-min-32-chars
JWT_REFRESH_SECRET=different-long-random-string-min-32-chars

# ── AWS S3 (only needed for file upload feature) ──
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_S3_BUCKET=your-s3-bucket-name

# ── OPTIONAL (defaults shown) ─────────────────────
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # leave blank if no Redis password
CORS_ORIGIN=http://localhost:5173,http://localhost:3001
```

**Start the backend:**
```bash
# 1. Start Postgres + Redis (Docker required)
docker-compose up postgres redis -d

# 2. Run database migrations
npm run prisma:migrate

# 3. Seed default admin account
npm run seed

# 4. Start the server
npm run start:dev
```

**Default Admin account (after seed):**
| Field | Value |
|---|---|
| Email | `admin@healthbridge.com` |
| Password | `Admin@1234` |

---

## Authentication Flow

All endpoints (except register / login / refresh) require this header:
```
Authorization: Bearer <accessToken>
```

Tokens expire — `accessToken` lasts **15 minutes**, `refreshToken` lasts **7 days**.
When the access token expires, call `/auth/refresh` with the refresh token to get a new pair.

---

## API Endpoints

### 🔐 Auth — `/api/v1/auth`

#### Register
```
POST /api/v1/auth/register
```
Body:
```json
{
  "email": "doctor@hospital.com",
  "password": "StrongP@ss1",
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "+2348012345678",
  "role": "DOCTOR"
}
```
> `role` is optional. Defaults to `"PATIENT"`. Options: `"ADMIN"` | `"DOCTOR"` | `"PATIENT"`

Response `201`:
```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "user": {
      "id": "uuid",
      "email": "doctor@hospital.com",
      "firstName": "Jane",
      "lastName": "Smith",
      "role": "DOCTOR"
    },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

---

#### Login
```
POST /api/v1/auth/login
```
Body:
```json
{
  "email": "admin@healthbridge.com",
  "password": "Admin@1234"
}
```
Response `200`:
```json
{
  "data": {
    "user": { "id": "uuid", "email": "...", "firstName": "...", "role": "ADMIN" },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

---

#### Refresh Token
```
POST /api/v1/auth/refresh
```
Body:
```json
{
  "refreshToken": "eyJhbGci..."
}
```
Response `200` — returns a **new** `accessToken` + `refreshToken` pair.

---

#### Logout
```
POST /api/v1/auth/logout
Authorization: Bearer <accessToken>
```
Body (optional — revoke specific refresh token, or omit to revoke all):
```json
{
  "refreshToken": "eyJhbGci..."
}
```
Response `200`: `{ "message": "Logged out successfully" }`

---

### 👤 Users — `/api/v1/users`
> All endpoints require `Authorization: Bearer <token>`

#### Create User *(Admin only)*
```
POST /api/v1/users
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

#### List All Users *(Admin only)*
```
GET /api/v1/users?page=1&limit=10
```
Response includes pagination meta:
```json
{
  "data": {
    "data": [ { "id": "...", "email": "...", "role": "PATIENT", ... } ],
    "meta": { "total": 50, "page": 1, "limit": 10, "pages": 5 }
  }
}
```

---

#### Get User by ID
```
GET /api/v1/users/:id
```

---

#### Update User Profile
```
PATCH /api/v1/users/:id
```
Body (all fields optional):
```json
{
  "firstName": "Updated",
  "lastName": "Name",
  "phone": "+2348099999999"
}
```
> Users can only update their own profile. Admins can update any user.

---

#### Change User Role *(Admin only)*
```
PATCH /api/v1/users/:id/role
```
Body:
```json
{ "role": "DOCTOR" }
```

---

#### Activate / Deactivate User *(Admin only)*
```
PATCH /api/v1/users/:id/status
```
Body:
```json
{ "isActive": false }
```

---

#### Delete User *(Admin only)*
```
DELETE /api/v1/users/:id
```

---

### 🏥 Hospitals — `/api/v1/hospitals`

#### Create Hospital *(Admin only)*
```
POST /api/v1/hospitals
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

#### List Hospitals *(any role)*
```
GET /api/v1/hospitals?page=1&limit=10
```

---

#### Get Hospital Details *(any role)*
```
GET /api/v1/hospitals/:id
```
Returns hospital info + list of assigned doctors.

---

#### Update Hospital *(Admin only)*
```
PATCH /api/v1/hospitals/:id
```
Body (all fields optional):
```json
{
  "name": "New Name",
  "address": "New Address",
  "isActive": true
}
```

---

#### Delete Hospital *(Admin only)*
```
DELETE /api/v1/hospitals/:id
```

---

#### Assign Doctor to Hospital *(Admin only)*
```
POST /api/v1/hospitals/:id/doctors
```
Body:
```json
{
  "userId": "uuid-of-user-with-DOCTOR-role",
  "specialization": "Cardiology",
  "licenseNumber": "LMC-2024-001"
}
```
> The user must already have `role: "DOCTOR"`. Set the role first via `PATCH /users/:id/role`.

---

#### List Doctors in a Hospital *(Admin, Doctor)*
```
GET /api/v1/hospitals/:id/doctors?page=1&limit=10
```

---

### 🧑‍⚕️ Patients — `/api/v1/patients`

#### Create Patient Profile
```
POST /api/v1/patients
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
> `gender` options: `"MALE"` | `"FEMALE"` | `"OTHER"`

---

#### List Patients
```
GET /api/v1/patients?page=1&limit=10
```
> **Admin/Doctor** — sees all patients.
> **Patient** — sees only their own profile.

---

#### Get Patient by ID
```
GET /api/v1/patients/:id
```
> Patients can only access their own record.

---

#### Update Patient
```
PATCH /api/v1/patients/:id
```
Body (all optional):
```json
{
  "bloodType": "A+",
  "allergies": ["Penicillin"],
  "emergencyContact": "Updated Contact"
}
```

---

#### Delete Patient *(Admin only)*
```
DELETE /api/v1/patients/:id
```

---

### 📋 Medical Records — `/api/v1/records`

#### Create Record *(Doctor/Admin)*
```
POST /api/v1/records
```
Body:
```json
{
  "patientId": "uuid-of-patient",
  "doctorId": "uuid-of-doctor-profile",
  "hospitalId": "uuid-of-hospital",
  "title": "Annual Check-up",
  "description": "Patient presented with mild hypertension.",
  "diagnosis": "Hypertension Stage 1",
  "treatment": "Lifestyle changes and monitoring",
  "prescription": "Amlodipine 5mg daily",
  "status": "ACTIVE",
  "visitDate": "2026-05-01T09:00:00.000Z"
}
```
> `status` options: `"DRAFT"` | `"ACTIVE"` | `"ARCHIVED"`

---

#### List Records
```
GET /api/v1/records?page=1&limit=10
```
> **Admin** — all records. **Doctor** — records they created. **Patient** — their own records.

---

#### Get Records for a Specific Patient
```
GET /api/v1/records/patient/:patientId?page=1&limit=10
```

---

#### Get Record by ID
```
GET /api/v1/records/:id
```

---

#### Update Record
```
PATCH /api/v1/records/:id
```
Body (all optional):
```json
{
  "diagnosis": "Updated diagnosis",
  "prescription": "New medication",
  "status": "ARCHIVED"
}
```

---

#### Delete Record
```
DELETE /api/v1/records/:id
```

---

### 📎 Files — `/api/v1/files`
> Requires AWS S3 configured in `.env`

#### Upload File to a Record
```
POST /api/v1/files/upload/:recordId
Content-Type: multipart/form-data
```
Form field: `file` (the actual file)

Allowed types: JPEG, PNG, GIF, PDF, DOC, DOCX — max **10MB**

Response:
```json
{
  "data": {
    "id": "uuid",
    "recordId": "...",
    "originalName": "xray.pdf",
    "mimeType": "application/pdf",
    "size": 204800,
    "s3Key": "records/xxx/yyy.pdf",
    "createdAt": "2026-05-01T..."
  }
}
```

---

#### List Files for a Record
```
GET /api/v1/files/record/:recordId
```

---

#### Get Pre-signed Download URL
```
GET /api/v1/files/:id/url
```
Response:
```json
{ "data": { "url": "https://s3.amazonaws.com/...?X-Amz-Signature=..." } }
```
> URL expires in **1 hour**. Use this URL directly in `<img>` or `<a href>`.

---

#### Delete File
```
DELETE /api/v1/files/:id
```

---

### 📝 Audit Logs — `/api/v1/audit`
*(Admin only)*

#### List All Audit Logs
```
GET /api/v1/audit?page=1&limit=10
```

#### Logs for a Specific User
```
GET /api/v1/audit/user/:userId?page=1&limit=10
```

---

## Standard Response Format

Every response follows this envelope:
```json
{
  "statusCode": 200,
  "message": "Success",
  "data": { ... },
  "timestamp": "2026-05-01T10:00:00.000Z"
}
```

**Error response:**
```json
{
  "statusCode": 401,
  "timestamp": "2026-05-01T10:00:00.000Z",
  "path": "/api/v1/auth/login",
  "message": "Invalid credentials"
}
```

---

## Pagination Query Params

All list endpoints accept:
| Param | Default | Max | Description |
|---|---|---|---|
| `page` | `1` | — | Page number |
| `limit` | `10` | `100` | Items per page |

---

## Rate Limiting

Public endpoints are rate-limited to **100 requests per 60 seconds** per IP.
Exceeding the limit returns HTTP `429 Too Many Requests`.

---

## Role Permissions Summary

| Endpoint | ADMIN | DOCTOR | PATIENT |
|---|:---:|:---:|:---:|
| Register / Login | ✅ | ✅ | ✅ |
| Manage any user | ✅ | ❌ | ❌ |
| Create hospital | ✅ | ❌ | ❌ |
| View hospitals | ✅ | ✅ | ✅ |
| Assign doctor to hospital | ✅ | ❌ | ❌ |
| Create patient profile | ✅ | ✅ | ✅ |
| View any patient | ✅ | ✅ | ❌ |
| View own patient profile | ✅ | ✅ | ✅ (own only) |
| Create medical record | ✅ | ✅ | ❌ |
| View medical records | ✅ | ✅ (own) | ✅ (own) |
| Upload / delete files | ✅ | ✅ | ❌ |
| View files | ✅ | ✅ (own) | ✅ (own) |
| View audit logs | ✅ | ❌ | ❌ |

---

## Typical Frontend Setup Flow

```
1. Register a user or use the seeded admin
2. POST /auth/login  →  save accessToken + refreshToken
3. Add to every request:  Authorization: Bearer <accessToken>
4. When you get 401 Unauthorized:
     POST /auth/refresh  →  save new accessToken + refreshToken
5. POST /auth/logout  to clear session
```

**Example Axios setup:**
```js
const api = axios.create({ baseURL: 'http://localhost:3000/api/v1' });

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
    if (err.response?.status === 401) {
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
```
