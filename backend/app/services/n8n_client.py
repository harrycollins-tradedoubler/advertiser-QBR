import httpx
from typing import Any


class N8nClient:
    """Client for calling n8n workflow webhooks."""

    def __init__(self, timeout: float = 360.0):
        self.timeout = timeout

    async def call_webhook(
        self,
        webhook_url: str,
        message: str,
        thread_id: str | None = None,
        extra_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Call an n8n webhook with a message.

        Args:
            webhook_url: The n8n webhook URL
            message: The user's message
            thread_id: Optional thread ID for conversation context
            extra_data: Optional additional data to send

        Returns:
            The response from the n8n workflow
        """
        payload = {
            "message": message,
            "thread_id": thread_id,
        }

        if extra_data:
            payload.update(extra_data)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                webhook_url,
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()


# Singleton instance
n8n_client = N8nClient()
