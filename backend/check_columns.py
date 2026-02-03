import asyncio
from app.services.db import neon_db


async def main():
    if neon_db.is_postgrest:
        rows = await neon_db.select_postgrest(
            table="conversation_logs_v2",
            select="*",
            filters={},
            limit=1,
        )
        if not rows:
            print([])
            return
        print(list(rows[0].keys()))
        return

    rows = await neon_db.query(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='conversation_logs_v2' "
        "ORDER BY ordinal_position"
    )
    print([r["column_name"] for r in rows])


asyncio.run(main())
