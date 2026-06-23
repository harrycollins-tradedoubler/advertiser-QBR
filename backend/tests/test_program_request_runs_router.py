import unittest
from unittest.mock import AsyncMock, patch

from app.routers.program_request_runs import create_program_request_run, get_program_request_runs


class ProgramRequestRunsRouterTest(unittest.IsolatedAsyncioTestCase):
    async def test_get_program_request_runs_returns_runs(self):
        runs = [{"programId": "310990", "timestamp": "2026-04-09T10:30:00+00:00"}]

        with patch(
            "app.routers.program_request_runs.list_program_request_runs",
            new=AsyncMock(return_value=runs),
        ):
            response = await get_program_request_runs(limit=5)

        self.assertEqual(response, {"runs": runs})

    async def test_create_program_request_run_accepts_wrapped_payload(self):
        result = {
            "recorded": True,
            "duplicate": False,
            "reason": "",
            "requestKey": "client@example.com|310990|2026-01-01|2026-03-31",
        }
        recorder = AsyncMock(return_value=result)

        with patch("app.routers.program_request_runs.record_program_request_result", new=recorder):
            response = await create_program_request_run({"payload": {"programId": "310990"}})

        self.assertEqual(response, result)
        recorder.assert_awaited_once_with({"programId": "310990"})


if __name__ == "__main__":
    unittest.main()
