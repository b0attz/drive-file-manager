# Google Drive File Manager

เว็บแอปหน้าเดียวสำหรับจัดการไฟล์บน Google Drive — อัปโหลด, ค้นหา, แสดงตัวอย่าง, แชร์ลิงก์

## สิ่งที่ต้องเตรียม

1. [Google Cloud Console](https://console.cloud.google.com) → สร้าง Project
2. ไปที่ **APIs & Services > Library** → ค้นหา "Google Drive API" → **Enable**
3. ไปที่ **APIs & Services > Credentials** → **Create Credentials** > **OAuth 2.0 Client ID**
   - Application type: **Web Application**
   - Authorized redirect URIs: `http://localhost:8000/auth/callback`
   - กด Create → จะได้ **Client ID** และ **Client Secret**

## วิธีติดตั้งและรัน

### 1. ติดตั้ง dependencies

```bash
pip install -r requirements.txt
```

### 2. ตั้งค่า `.env`

เปิดไฟล์ `.env` แล้วใส่ค่าที่ได้จาก Google Cloud Console:

```
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
SECRET_KEY=ใส่ข้อความยาวๆสุ่มๆอย่างน้อย32ตัวอักษร
APP_URL=http://localhost:8000
MAX_UPLOAD_SIZE_MB=100
```

### 3. รัน

```bash
uvicorn main:app --reload
```

หรือ

```bash
python main.py
```

### 4. เปิด browser

ไปที่ [http://localhost:8000](http://localhost:8000) → กด "Sign in with Google"

## การใช้งาน

| ฟีเจอร์ | วิธีใช้ |
|---------|--------|
| **อัปโหลดไฟล์** | กดปุ่ม ⬆ อัปโหลด หรือลากไฟล์วางบนหน้าเว็บ |
| **สร้างโฟลเดอร์** | กด + โฟลเดอร์ใหม่ |
| **เข้าโฟลเดอร์** | คลิกที่โฟลเดอร์ |
| **กลับโฟลเดอร์ก่อนหน้า** | คลิกที่ breadcrumb |
| **ค้นหาไฟล์** | พิมพ์ชื่อไฟล์ในช่องค้นหา |
| **แสดงตัวอย่างรูป** | คลิกที่ไฟล์รูปภาพ |
| **แชร์ลิงก์** | วางเมาส์บนไฟล์ → กด 🔗 |
| **ดาวน์โหลด** | วางเมาส์บนไฟล์ → กด ⬇ |
| **ลบไฟล์** | วางเมาส์บนไฟล์ → กด 🗑 |

## โครงสร้างโปรเจกต์

```
├── main.py              # FastAPI backend (OAuth + Drive API + routes)
├── requirements.txt     # Dependencies
├── .env                 # Configuration (ไม่รวมใน git)
├── .gitignore
├── README.md
├── tokens/              # OAuth tokens (สร้างอัตโนมัติ, ไม่รวมใน git)
├── templates/
│   └── index.html       # Single-page frontend
└── static/
    ├── style.css        # Styles
    └── app.js           # Client-side logic
```

## Tech Stack

- **Backend**: Python + FastAPI
- **Auth**: Google OAuth 2.0 (google-auth-oauthlib)
- **Storage**: Google Drive API v3
- **Frontend**: Vanilla JavaScript (ไม่มี framework)

## Deploy บน Render.com

### ขั้นตอน

1. **Push code ขึ้น GitHub**
   ```bash
   git init
   git add .
   git commit -m "first commit"
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git push -u origin main
   ```

2. **ไปที่ [Render Dashboard](https://dashboard.render.com)** → **New +** → **Web Service**
   - Connect GitHub repo
   - **Name**: `drive-file-manager` (หรืออะไรก็ได้)
   - **Runtime**: `Python`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: `Free`

3. **ตั้งค่า Environment Variables** (ใน Render dashboard → Environment):
   ```
   GOOGLE_CLIENT_ID=...         # จาก Google Cloud Console
   GOOGLE_CLIENT_SECRET=...     # จาก Google Cloud Console
   SECRET_KEY=...(ข้อความสุ่มยาวๆ)
   APP_URL=https://your-app-name.onrender.com  # URL ที่ Render ให้
   MAX_UPLOAD_SIZE_MB=100
   ```

4. **อัปเดต Google OAuth redirect URI**
   - ไปที่ [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials**
   - แก้ไข OAuth 2.0 Client ID → **Authorized redirect URIs**
   - เพิ่ม `https://your-app-name.onrender.com/auth/callback`
   - (เก็บ `http://localhost:8000/auth/callback` ไว้ด้วยสำหรับ local dev)

5. **Deploy** — Render จะ auto-deploy เมื่อ push code

### หมายเหตุ
- **Free tier** Render จะ sleep เมื่อไม่มีการใช้งาน 15 นาที → เปิดครั้งแรกอาจช้า 30-60 วิ
- ถ้า deploy ไม่ผ่าน ให้เช็ค log ที่ Render dashboard
- ใช้ `render.yaml` ใน repo นี้สำหรับ Render Blueprint (deploy อัตโนมัติ)
