# qbr-pptx-service Instructions

- Treat `qbr-pptx-service` as the only writable implementation target for QBR PPTX changes unless the user explicitly says otherwise.
- Do not edit files in `publisher-qbr` as part of work scoped to this service.
- `publisher-qbr` may be read only to cross-check logic, payload shapes, or configuration patterns.
- Keep tests and implementation changes for this service inside `qbr-pptx-service`.
- Port separation is mandatory:
- `publisher-qbr` service runs on `3010`.
- `qbr-pptx-service` advertiser QBR service runs on `3011`.
- Never assume these ports are interchangeable.
- When discussing restarts, local URLs, or Cloudflare tunnels for `qbr-pptx-service`, always use `http://127.0.0.1:3011` unless the user explicitly changes the port.
- Never point the advertiser QBR tunnel at `3010`, and never point the publisher QBR tunnel at `3011`.
- If there is any ambiguity about which service a tunnel or request targets, stop and clarify the service name and port before proceeding.
