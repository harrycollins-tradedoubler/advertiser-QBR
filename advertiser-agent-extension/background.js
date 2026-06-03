chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "ADVERTISER_AGENT_API_REQUEST") {
    return false;
  }

  const url = msg.url;
  const method = msg.method || "GET";
  const headers = msg.headers || {};
  const body = msg.body;

  fetch(url, { method, headers, body })
    .then(async (response) => {
      const text = await response.text();
      let data = text;

      try {
        data = text ? JSON.parse(text) : null;
      } catch (_error) {
        data = text;
      }

      sendResponse({
        ok: true,
        response: {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          data
        }
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: `Failed to fetch ${url}: ${error.message}`
      });
    });

  return true;
});
