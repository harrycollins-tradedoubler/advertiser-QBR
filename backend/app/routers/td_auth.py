from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request

from app.config import get_settings

router = APIRouter()
settings = get_settings()

user_access_token: str | None = None
impersonate_access_token: str | None = None


def _td_user_base() -> str:
    return settings.td_user_url.rstrip("/")


def _td_manage_base() -> str:
    return settings.td_manage_url.rstrip("/")


def _td_impersonate_base() -> str:
    return settings.td_impersonate_url.rstrip("/")


def _error_detail(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        text = response.text.strip()
        return text or f"TD request failed with status {response.status_code}"

    if isinstance(data, dict):
        detail = data.get("detail") or data.get("message")
        if isinstance(detail, str) and detail.strip():
            return detail
    return str(data)


async def _get_json(url: str, headers: dict[str, str]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(trust_env=False) as client:
            response = await client.get(url, headers=headers, timeout=30)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"TD request failed: {exc}") from exc

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=_error_detail(response))

    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="TD response was not valid JSON") from exc


async def _post_form_json(url: str, headers: dict[str, str], data: dict[str, str]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(trust_env=False) as client:
            response = await client.post(url, headers=headers, data=data, timeout=30)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"TD OAuth request failed: {exc}") from exc

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=_error_detail(response))

    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="TD OAuth response was not valid JSON") from exc


def _authorization_header(value: str) -> dict[str, str]:
    auth_value = value.strip()
    if not auth_value:
        return {}
    if auth_value.lower().startswith("basic "):
        return {"Authorization": auth_value}
    return {"Authorization": f"Basic {auth_value}"}


async def _ensure_user_access_token() -> str:
    global user_access_token
    if user_access_token:
        return user_access_token

    if not settings.td_oauth_url:
        raise HTTPException(
            status_code=400,
            detail="No TD user access token available. Configure backend OAuth credentials or send a Bearer token once.",
        )
    if not settings.td_oauth_username or not settings.td_oauth_password:
        raise HTTPException(status_code=500, detail="TD OAuth username/password are not configured")

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        **_authorization_header(settings.td_oauth_basic_auth),
    }
    data = {
        "grant_type": "password",
        "username": settings.td_oauth_username,
        "password": settings.td_oauth_password,
    }
    response = await _post_form_json(settings.td_oauth_url, headers, data)
    access_token = response.get("access_token")
    if not access_token:
        raise HTTPException(status_code=500, detail="Access token not found in TD OAuth response")

    user_access_token = str(access_token)
    return user_access_token


async def _impersonate_username(username: str) -> dict[str, str]:
    user_token = await _ensure_user_access_token()
    impersonate_url = f"{_td_impersonate_base()}?{urlencode({'username': username})}"
    data = await _get_json(impersonate_url, {"Authorization": f"Bearer {user_token}"})

    access_token = data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=500, detail="Access token not found in impersonation response")

    global impersonate_access_token
    impersonate_access_token = str(access_token)
    return {
        "user_access_token": user_token,
        "impersonate_access_token": impersonate_access_token,
    }


def get_current_td_tokens() -> dict[str, str] | None:
    if not user_access_token or not impersonate_access_token:
        return None
    return {
        "user_access_token": user_access_token,
        "impersonate_access_token": impersonate_access_token,
    }


@router.post("/td/fetch-user")
async def fetch_user(request: Request) -> dict[str, Any]:
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="No access token provided")

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="No access token provided")

    url = f"{_td_user_base()}/users/me"
    headers = {"Authorization": f"Bearer {token}"}
    data = await _get_json(url, headers)

    global user_access_token
    user_access_token = token
    return data


@router.get("/td/impersonated-user")
async def fetch_impersonated_user() -> dict[str, Any]:
    if not impersonate_access_token:
        raise HTTPException(status_code=400, detail="No impersonate token available")

    url = f"{_td_user_base()}/users/me"
    headers = {"Authorization": f"Bearer {impersonate_access_token}"}
    return await _get_json(url, headers)


@router.post("/td/impersonate")
async def impersonate_user(payload: dict[str, Any]) -> dict[str, Any]:
    username = (payload or {}).get("username")
    if not username:
        raise HTTPException(status_code=400, detail="username is required")
    if not user_access_token:
        raise HTTPException(status_code=400, detail="No user access token available")

    await _impersonate_username(str(username))
    return {"status": "ok"}


@router.post("/td/advertiser-impersonate")
async def advertiser_impersonate(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    username = (
        (payload or {}).get("username")
        or (payload or {}).get("clientUsername")
        or (payload or {}).get("impersonateUsername")
    )
    username = str(username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="client username is required")

    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token:
            global user_access_token
            user_access_token = token

    await _impersonate_username(username)
    return {
        "status": "ok",
        "username": username,
        "impersonated": True,
        "tokenStoredServerSide": True,
    }


@router.get("/td/organisation")
async def get_organisation() -> dict[str, Any]:
    if not impersonate_access_token:
        raise HTTPException(status_code=400, detail="No impersonate access token provided")

    url = f"{_td_manage_base()}/account"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {impersonate_access_token}",
    }
    return await _get_json(url, headers)


@router.get("/td/impersonate-username")
async def get_impersonate_username(organizationId: str | None = None) -> dict[str, Any]:
    if not organizationId:
        raise HTTPException(status_code=400, detail="organizationId is required")
    if not user_access_token:
        raise HTTPException(status_code=400, detail="No user access token available")

    url = (
        f"{_td_user_base()}/internal/users?"
        f"organizationId={organizationId}&deleted=false&limit=100"
    )
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {user_access_token}",
    }
    data = await _get_json(url, headers)

    items = data.get("items", [])
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=500, detail="No users found or unexpected response format")

    filtered = [item for item in items if item.get("roleId") in (1, 2)]
    filtered.sort(key=lambda item: item.get("roleId", 999))
    return filtered[0] if filtered else items[0]


@router.get("/td/programs")
async def get_programs(request: Request, organizationId: str | None = None, limit: int = 100) -> dict[str, Any]:
    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token:
            global user_access_token
            user_access_token = token

    if not user_access_token:
        raise HTTPException(status_code=400, detail="No user access token available")
    if not organizationId:
        raise HTTPException(status_code=400, detail="organizationId is required")

    users_url = (
        f"{_td_user_base()}/internal/users?"
        f"organizationId={organizationId}&deleted=false&limit=100"
    )
    user_headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {user_access_token}",
    }
    users_data = await _get_json(users_url, user_headers)

    items = users_data.get("items", [])
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=500, detail="No users found or unexpected response format")

    filtered = [item for item in items if item.get("roleId") in (1, 2)]
    filtered.sort(key=lambda item: item.get("roleId", 999))
    owner = filtered[0] if filtered else items[0]
    owner_username = owner.get("username")
    if not owner_username:
        raise HTTPException(status_code=500, detail="Owner username not found")

    impersonate_url = f"{_td_impersonate_base()}?username={owner_username}"
    imp_data = await _get_json(
        impersonate_url,
        {"Authorization": f"Bearer {user_access_token}"},
    )

    access_token = imp_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=500, detail="Access token not found in response")

    global impersonate_access_token
    impersonate_access_token = access_token

    safe_limit = min(max(limit, 1), 100)
    url = f"{_td_manage_base()}/programs?limit={safe_limit}"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {impersonate_access_token}",
    }
    programs_data = await _get_json(url, headers)
    tokens = {
        "user_access_token": user_access_token,
        "impersonate_access_token": impersonate_access_token,
    }
    if isinstance(programs_data, dict):
        programs_data["td_tokens"] = tokens
        return programs_data
    return {"items": programs_data if isinstance(programs_data, list) else [], "td_tokens": tokens}


@router.get("/td/advertiser-programs")
async def get_advertiser_programs(limit: int = 100) -> dict[str, Any]:
    if not impersonate_access_token:
        raise HTTPException(status_code=400, detail="No advertiser impersonation token available")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {impersonate_access_token}",
    }
    candidate_urls = [
        f"{_td_manage_base()}/programs/",
        f"{_td_manage_base()}/programs",
    ]

    last_not_found: HTTPException | None = None
    for url in candidate_urls:
        try:
            programs_data = await _get_json(url, headers)
            break
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            last_not_found = exc
    else:
        detail = getattr(last_not_found, "detail", "TD advertiser programs endpoint was not found")
        raise HTTPException(status_code=404, detail=detail)

    if isinstance(programs_data, dict):
        return programs_data
    return {"items": programs_data if isinstance(programs_data, list) else []}


@router.post("/td/clear-tokens")
async def clear_tokens() -> dict[str, str]:
    global user_access_token, impersonate_access_token
    user_access_token = None
    impersonate_access_token = None
    return {"status": "cleared"}
