import axios from "axios";
import FormData from "form-data";

export async function sendTextMessage({ graphApiVersion, phoneNumberId, token, to, body }) {
  const url = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;

  return axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        preview_url: false,
        body
      }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );
}

export async function uploadMediaBuffer({ graphApiVersion, phoneNumberId, token, buffer, filename, contentType }) {
  const url = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/media`;
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", buffer, {
    filename,
    contentType
  });

  const response = await axios.post(url, form, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders()
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 60000
  });

  return response.data?.id;
}

export async function sendAudioMessage({ graphApiVersion, phoneNumberId, token, to, mediaId }) {
  const url = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;

  return axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "audio",
      audio: {
        id: mediaId
      }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );
}

export function extractIncomingMessage(body) {
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];
  const contact = value?.contacts?.[0];

  if (!message) return null;

  return {
    from: String(message.from || "").replace(/\D/g, ""),
    id: message.id,
    type: message.type,
    text: message.text?.body || "",
    timestamp: message.timestamp,
    profileName: contact?.profile?.name || "",
    isGroup: Boolean(String(message.from || "").includes("-"))
  };
}
