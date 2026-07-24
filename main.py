"""
Google Drive File Manager
FastAPI backend — OAuth 2.0 + Google Drive API v3
"""

import io
import json
import logging
import mimetypes
import os
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import requests as http_requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from starlette.middleware.sessions import SessionMiddleware

# ── Configuration ──────────────────────────────────────────────────────

load_dotenv()

GOOGLE_CLIENT_ID = os.environ["GOOGLE_CLIENT_ID"]
GOOGLE_CLIENT_SECRET = os.environ["GOOGLE_CLIENT_SECRET"]
SECRET_KEY = os.environ["SECRET_KEY"]
APP_URL = os.environ.get("APP_URL", "http://localhost:8000").rstrip("/")
PORT = int(os.environ.get("PORT", 8000))
MAX_UPLOAD_SIZE_MB = int(os.environ.get("MAX_UPLOAD_SIZE_MB", 100))
MAX_UPLOAD_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

TOKEN_DIR = Path("tokens")
TOKEN_DIR.mkdir(exist_ok=True)

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

DRIVE_FIELDS = "id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink,iconLink"

CLIENT_CONFIG = {
    "web": {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [f"{APP_URL}/auth/callback"],
    }
}

# ── Token Management ───────────────────────────────────────────────────

def _safe_email(email: str) -> str:
    return email.replace("@", "_at_").replace(".", "_dot_")


def save_token(email: str, creds: Credentials) -> None:
    path = TOKEN_DIR / f"{_safe_email(email)}.json"
    data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes,
    }
    path.write_text(json.dumps(data, indent=2))


def load_token(email: str) -> Credentials | None:
    path = TOKEN_DIR / f"{_safe_email(email)}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    creds = Credentials(**data)
    # Force re-auth if scope changed
    if set(creds.scopes or []) != set(SCOPES):
        path.unlink()
        return None
    return creds


def delete_token(email: str) -> None:
    path = TOKEN_DIR / f"{_safe_email(email)}.json"
    if path.exists():
        path.unlink()


# ── OAuth Helpers ──────────────────────────────────────────────────────

def create_flow() -> Flow:
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES)
    flow.redirect_uri = f"{APP_URL}/auth/callback"
    return flow


# ── FastAPI App ────────────────────────────────────────────────────────

app = FastAPI(title="Google Drive File Manager")
is_https = APP_URL.startswith("https")
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY, session_cookie="drive_session", same_site="lax", https_only=is_https)

app.mount("/static", StaticFiles(directory="static"), name="static")


# ── Auth Dependency ────────────────────────────────────────────────────

async def get_drive_service(request: Request):
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    creds = load_token(email)
    if not creds:
        raise HTTPException(status_code=401, detail="Session expired")
    if creds.expired:
        try:
            creds.refresh(GoogleRequest())
            save_token(email, creds)
        except Exception:
            delete_token(email)
            request.session.clear()
            raise HTTPException(status_code=401, detail="Token refresh failed, please re-login")
    service = build("drive", "v3", credentials=creds)
    return service, email


# ── OAuth Routes ───────────────────────────────────────────────────────

@app.get("/auth/login")
async def auth_login(request: Request):
    request.session.clear()
    flow = create_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline", prompt="consent", include_granted_scopes="true"
    )
    request.session["oauth_state"] = state
    request.session["code_verifier"] = flow.code_verifier
    return RedirectResponse(auth_url)


@app.get("/auth/callback")
async def auth_callback(request: Request, code: str = "", state: str = ""):
    saved_state = request.session.get("oauth_state")
    saved_verifier = request.session.get("code_verifier", "")
    logger.info("callback: state=%s saved=%s code_len=%d verifier_len=%d", state, saved_state, len(code), len(saved_verifier))
    if not saved_state or saved_state != state:
        logger.warning("callback: state mismatch saved=%s got=%s", saved_state, state)
        raise HTTPException(status_code=400, detail="State mismatch — CSRF detected")
    try:
        flow = create_flow()
        flow.code_verifier = saved_verifier or None
        logger.info("callback: redirect_uri=%s code_verifier_present=%s", flow.redirect_uri, bool(saved_verifier))
        flow.fetch_token(code=code)
    except Exception as e:
        logger.exception("callback: token exchange failed")
        raise HTTPException(status_code=500, detail=f"Token exchange failed: {e}")
    creds = flow.credentials

    try:
        resp = http_requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {creds.token}"},
        )
        userinfo = resp.json()
        email = userinfo["email"]
    except Exception as e:
        logger.exception("callback: userinfo fetch failed")
        raise HTTPException(status_code=500, detail=f"Userinfo fetch failed: {e}")

    save_token(email, creds)
    request.session["email"] = email
    request.session.pop("oauth_state", None)
    return RedirectResponse(url="/")


@app.get("/auth/logout")
async def auth_logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/")


# ── User Info ──────────────────────────────────────────────────────────

@app.get("/api/me")
async def api_me(request: Request):
    try:
        service, email = await get_drive_service(request)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Not authenticated")

    creds = load_token(email)
    resp = http_requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {creds.token}"},
    )
    userinfo = resp.json()
    return {
        "email": userinfo.get("email"),
        "name": userinfo.get("name"),
        "picture": userinfo.get("picture"),
    }


# ── Drive API Helpers ──────────────────────────────────────────────────

async def _list_files(service, folder_id: str = "root", page_token: str = "", page_size: int = 50) -> dict:
    """List files (non-recursive) inside a folder, folders first."""
    q = f"'{folder_id}' in parents and trashed = false"
    kwargs = {
        "q": q,
        "pageSize": min(page_size, 100),
        "fields": f"files({DRIVE_FIELDS}),nextPageToken",
        "orderBy": "folder,modifiedTime desc",
    }
    if page_token:
        kwargs["pageToken"] = page_token
    results = service.files().list(**kwargs).execute()
    files = results.get("files", [])
    return {"files": files, "nextPageToken": results.get("nextPageToken")}


async def _search_files(service, query: str, folder_id: str = "") -> dict:
    """Search files by name."""
    q = f"name contains '{query.replace(chr(39), '')}' and trashed = false"
    if folder_id:
        q += f" and '{folder_id}' in parents"
    results = service.files().list(
        q=q,
        pageSize=100,
        fields=f"files({DRIVE_FIELDS})",
        orderBy="folder,modifiedTime desc",
    ).execute()
    files = results.get("files", [])
    return {"files": files}


async def _upload_files(service, files: list[UploadFile], folder_id: str = "root") -> list[dict]:
    """Upload multiple files to Google Drive."""
    uploaded = []
    for upload_file in files:
        content = await upload_file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File {upload_file.filename} exceeds {MAX_UPLOAD_SIZE_MB}MB limit",
            )
        mime_type, _ = mimetypes.guess_type(upload_file.filename or "")
        mime_type = mime_type or "application/octet-stream"

        media = MediaIoBaseUpload(
            io.BytesIO(content), mimetype=mime_type, resumable=True, chunksize=1024*1024
        )
        metadata = {"name": upload_file.filename, "parents": [folder_id]}
        result = service.files().create(
            body=metadata,
            media_body=media,
            fields=DRIVE_FIELDS,
        ).execute()
        uploaded.append(result)
    return uploaded


async def _trash_file(service, file_id: str) -> None:
    try:
        service.files().update(fileId=file_id, body={"trashed": True}).execute()
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")


async def _restore_file(service, file_id: str) -> None:
    try:
        service.files().update(fileId=file_id, body={"trashed": False}).execute()
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")


async def _share_file(service, file_id: str, email: str = "") -> str:
    """Share a file. If email given, share with that user; otherwise create public link."""
    if email:
        service.permissions().create(
            fileId=file_id, body={"type": "user", "role": "reader", "emailAddress": email}
        ).execute()
    else:
        service.permissions().create(
            fileId=file_id, body={"type": "anyone", "role": "reader"}
        ).execute()
    meta = service.files().get(fileId=file_id, fields="webViewLink").execute()
    return meta.get("webViewLink", f"https://drive.google.com/file/d/{file_id}/view")


async def _download_file(service, file_id: str) -> tuple[bytes, str, str]:
    """Download file content + mime type + name."""
    meta = service.files().get(fileId=file_id, fields="mimeType,name,size").execute()
    size = int(meta.get("size", 0))
    if size > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large for preview (max 50MB)")
    content = service.files().get_media(fileId=file_id).execute()
    return content, meta.get("mimeType", "application/octet-stream"), meta.get("name", "file")


async def _move_file(service, file_id: str, new_parent_id: str, old_parent_id: str) -> dict:
    """Move a file to a different folder."""
    result = service.files().update(
        fileId=file_id,
        addParents=new_parent_id,
        removeParents=old_parent_id,
        fields=DRIVE_FIELDS,
    ).execute()
    return result


async def _copy_file(service, file_id: str, target_parent_id: str) -> dict:
    """Copy a file to a target folder."""
    result = service.files().copy(
        fileId=file_id,
        body={"parents": [target_parent_id]},
        fields=DRIVE_FIELDS,
    ).execute()
    return result


async def _create_folder(service, name: str, parent_id: str = "root") -> dict:
    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    result = service.files().create(body=metadata, fields=DRIVE_FIELDS).execute()
    return result


# ── File Routes ────────────────────────────────────────────────────────

@app.get("/api/files")
async def list_files(
    request: Request,
    folder_id: str = "root",
    page_token: str = "",
    page_size: int = 50,
):
    service, _ = await get_drive_service(request)
    return await _list_files(service, folder_id, page_token, page_size)


@app.get("/api/files/search")
async def search_files(request: Request, q: str, folder_id: str = ""):
    service, _ = await get_drive_service(request)
    return await _search_files(service, q, folder_id)


@app.post("/api/files/upload")
async def upload_files(
    request: Request,
    files: list[UploadFile] = File(...),
    folder_id: str = Form("root"),
):
    service, _ = await get_drive_service(request)
    uploaded = await _upload_files(service, files, folder_id)
    return {"files": uploaded}


@app.delete("/api/files/{file_id:str}")
async def delete_file(request: Request, file_id: str):
    service, _ = await get_drive_service(request)
    await _trash_file(service, file_id)
    return {"trashed": True}


@app.patch("/api/files/{file_id:str}")
async def rename_file(request: Request, file_id: str):
    service, _ = await get_drive_service(request)
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    result = service.files().update(fileId=file_id, body={"name": name}, fields=DRIVE_FIELDS).execute()
    return result


@app.post("/api/files/{file_id:str}/restore")
async def restore_file(request: Request, file_id: str):
    service, _ = await get_drive_service(request)
    await _restore_file(service, file_id)
    return {"restored": True}


@app.delete("/api/files/{file_id:str}/permanent")
async def permanent_delete(request: Request, file_id: str):
    service, _ = await get_drive_service(request)
    service.files().delete(fileId=file_id).execute()
    return {"deleted": True}


@app.get("/api/trash")
async def list_trash(request: Request):
    service, _ = await get_drive_service(request)
    results = service.files().list(
        q="trashed = true",
        pageSize=100,
        fields=f"files({DRIVE_FIELDS})",
        orderBy="modifiedTime desc",
    ).execute()
    return {"files": results.get("files", [])}


@app.get("/api/files/{file_id:str}/download")
async def download_file(request: Request, file_id: str):
    service, _ = await get_drive_service(request)
    content, mime_type, name = await _download_file(service, file_id)
    return StreamingResponse(
        iter([content]),
        media_type=mime_type,
        headers={"Content-Disposition": "inline"},
    )


@app.post("/api/files/{file_id:str}/share")
async def share_file(request: Request, file_id: str):
    service, _ = await get_drive_service(request)
    body = await request.json()
    email = body.get("email", "")
    link = await _share_file(service, file_id, email)
    return {"link": link}


@app.post("/api/files/{file_id:str}/move")
async def move_file(request: Request, file_id: str):
    service, _ = await get_drive_service(request)
    body = await request.json()
    result = await _move_file(service, file_id, body["folder_id"], body["old_parent_id"])
    return {"file": result}


@app.post("/api/files/{file_id:str}/copy")
async def copy_file(request: Request, file_id: str):
    service, _ = await get_drive_service(request)
    body = await request.json()
    result = await _copy_file(service, file_id, body["folder_id"])
    return {"file": result}


# ── Folder Routes ──────────────────────────────────────────────────────

@app.post("/api/folders")
async def create_folder(request: Request):
    body = await request.json()
    name = body.get("name")
    parent_id = body.get("parent_id", "root")
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    service, _ = await get_drive_service(request)
    folder = await _create_folder(service, name, parent_id)
    return folder


# ── Root Route ─────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/favicon.ico")
async def favicon():
    return HTMLResponse("")

@app.get("/")
async def index():
    return HTMLResponse(Path("templates/index.html").read_text(encoding="utf-8"))


# ── Entry Point ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=(os.environ.get("RENDER") is None))
