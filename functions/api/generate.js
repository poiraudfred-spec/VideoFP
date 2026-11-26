
const HF_SPACE_BASE =
  "https://cbensimon-wan2-2-fp8da-aoti-preview2.hf.space";

const DEFAULT_NEGATIVE_PROMPT =
  "色调艳丽, 过曝, 静态, 细节模糊不清, 字幕, 风格, 作品, 画作, 画面, 静止, 整体发灰, " +
  "最差质量, 低质量, JPEG压缩残留, 丑陋的, 残缺的, 多余的手指, 画得不好的手部, " +
  "画得不好的脸部, 畸形的, 毁容的, 形态畸形的肢体, 手指融合, 静止不动的画面, " +
  "杂乱的背景, 三条腿, 背景人很多, 倒着走";

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== "POST") {
    return json({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const form = await request.formData();
    const photo = form.get("image");
    const paramsRaw = form.get("params");

    if (!(photo instanceof File)) {
      return json({ error: "Photo manquante." }, 400);
    }

    if (!photo.type.startsWith("image/")) {
      return json({ error: "Le fichier doit être une image." }, 400);
    }

    if (photo.size > 8 * 1024 * 1024) {
      return json({ error: "La photo ne doit pas dépasser 8 Mo." }, 413);
    }

    let params = {};

    if (typeof paramsRaw === "string") {
      try {
        const parsed = JSON.parse(paramsRaw);
        if (parsed && typeof parsed === "object") {
          params = parsed;
        }
      } catch {
        return json({ error: "Paramètres invalides." }, 400);
      }
    }

    const prompt =
      typeof params.prompt === "string" ? params.prompt.trim() : "";

    if (!prompt) {
      return json(
        { error: "Décris le mouvement que tu souhaites créer." },
        400
      );
    }

    const duration = clampFloat(
      Number(params.duration_seconds ?? 3.5),
      0.5,
      4.5
    );

    const steps = clampInt(Number(params.steps ?? 6), 1, 12);

    const uploadForm = new FormData();
    uploadForm.append("files", photo, photo.name || "photo.png");

    const uploadResponse = await fetch(
      `${HF_SPACE_BASE}/gradio_api/upload`,
      {
        method: "POST",
        body: uploadForm
      }
    );

    if (!uploadResponse.ok) {
      return json(
        { error: "Le serveur vidéo est indisponible. Réessaie plus tard." },
        502
      );
    }

    const paths = await uploadResponse.json();

    if (!Array.isArray(paths) || !paths[0]) {
      return json(
        { error: "Le serveur n'a pas accepté la photo." },
        502
      );
    }

    const imagePath = paths[0];

    const inputImage = {
      path: imagePath,
      url: `${HF_SPACE_BASE}/gradio_api/file=${imagePath}`,
      orig_name: photo.name || "photo.png",
      size: null,
      mime_type: photo.type || null,
      meta: { _type: "gradio.FileData" }
    };

    const data = [
  inputImage,
  null,
  prompt,
  6,
  DEFAULT_NEGATIVE_PROMPT,
  duration,
  1,
  1,
  42,
  true,
  6,
  "UniPCMultistep",
  3.0,
  16,
  false,
  true
];

    const submitResponse = await fetch(
      `${HF_SPACE_BASE}/gradio_api/call/generate_video`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data })
      }
    );

    if (!submitResponse.ok) {
      return json(
        { error: "Impossible de lancer la génération vidéo." },
        502
      );
    }

    const submitBody = await submitResponse.json();

    if (!submitBody.event_id) {
      return json(
        { error: "Le serveur n'a pas confirmé la génération." },
        502
      );
    }

    const streamResponse = await fetch(
      `${HF_SPACE_BASE}/gradio_api/call/generate_video/${submitBody.event_id}`,
      {
        method: "GET",
        headers: { Accept: "text/event-stream" }
      }
    );

    if (!streamResponse.ok || !streamResponse.body) {
      return json(
        { error: "Impossible de récupérer la vidéo générée." },
        502
      );
    }

    return new Response(streamResponse.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no"
      }
    });

  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    return json(
      { error: `Erreur du moteur vidéo : ${message}` },
      500
    );
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function clampInt(value, min, max) {
  const number = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, number));
}

function clampFloat(value, min, max) {
  const number = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, number));
}
