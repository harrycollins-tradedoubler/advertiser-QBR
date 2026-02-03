import asyncpg
import httpx
from app.config import get_settings


class NeonDB:
    """Client for querying Neon PostgreSQL via REST API."""

    def __init__(self):
        settings = get_settings()
        self.api_url = settings.neon_api_url.rstrip("/")
        self.timeout = 30.0
        self.auth_token = settings.neon_data_api_token.strip()
        self.database_url = settings.database_url.strip()
        self.is_postgrest = bool(self.api_url) and "/rest/v1" in self.api_url and not self.database_url

    async def query(self, sql: str, params: list | None = None) -> list[dict]:
        """
        Execute a SQL query via Neon REST API.

        Args:
            sql: SQL query string with $1, $2, etc. placeholders
            params: List of parameter values

        Returns:
            List of row dicts
        """
        if self.database_url:
            conn = await asyncpg.connect(self.database_url)
            try:
                records = await conn.fetch(sql, *(params or []))
            finally:
                await conn.close()
            return [dict(record) for record in records]

        if self.is_postgrest:
            raise ValueError(
                "NEON_API_URL points to a PostgREST endpoint; SQL queries are not supported here."
            )
        if not self.api_url or not self.api_url.strip():
            raise ValueError(
                "NEON_API_URL is not set. Add it to backend/.env with your Neon SQL-over-HTTP endpoint."
            )
        payload = {"query": sql}
        if params:
            payload["params"] = params

        headers = {}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()

            # Neon REST API returns { columns: [...], rows: [...] }
            # or for the /sql endpoint: { fields: [...], rows: [...], command: ... }
            if isinstance(data, list) and len(data) > 0:
                # Array response format (multiple statements)
                result = data[0]
            else:
                result = data

            columns = result.get("fields", result.get("columns", []))
            rows = result.get("rows", [])

            # Convert to list of dicts
            col_names = [
                col.get("name", col) if isinstance(col, dict) else col
                for col in columns
            ]

            return [dict(zip(col_names, row)) for row in rows]

    async def select_postgrest(
        self,
        table: str,
        select: str,
        filters: dict[str, str] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        """
        Query a PostgREST endpoint using query parameters.
        """
        if not self.is_postgrest:
            raise ValueError(
                "NEON_API_URL is not a PostgREST endpoint; use SQL queries instead."
            )
        if self.database_url:
            raise ValueError(
                "DATABASE_URL is set; PostgREST queries are disabled in favor of direct SQL."
            )
        if not self.api_url or not self.api_url.strip():
            raise ValueError(
                "NEON_API_URL is not set. Add it to backend/.env with your Neon Data API endpoint."
            )
        params: dict[str, str] = {"select": select}
        if filters:
            params.update(filters)
        if order:
            params["order"] = order
        if limit is not None:
            params["limit"] = str(limit)

        headers = {}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.api_url}/{table}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()


# Singleton instance
neon_db = NeonDB()
