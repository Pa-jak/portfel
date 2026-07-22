import type { FastifyInstance } from "fastify";

// Reveal/hide phrases are configured ONLY server-side via env vars and are never
// sent to any client. They are never stored in the `settings` table. This route is
// the ONLY place where the typed text is compared to the configured phrases.
// An env var set to an empty/whitespace string (e.g. docker-compose passthrough
// `${PORTFEL_REVEAL_PHRASE:-}` when the host var is unset) must fall back to the
// default — `??` alone would keep the empty string and disable the feature.
function phraseFromEnv(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

const REVEAL_PHRASE = phraseFromEnv(process.env.PORTFEL_REVEAL_PHRASE, "Alohomora");
const HIDE_PHRASE = phraseFromEnv(process.env.PORTFEL_HIDE_PHRASE, "Obliviate");

type SearchAction = "reveal" | "hide" | "none";

interface SearchBody {
  q?: unknown;
}

export default async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SearchBody }>("/api/search", async (req, reply) => {
    const raw = req.body?.q;
    if (typeof raw !== "string") {
      return reply.code(400).send({ error: "missing q" });
    }
    const q = raw.trim();
    let action: SearchAction = "none";
    if (q === REVEAL_PHRASE && REVEAL_PHRASE.length > 0) {
      action = "reveal";
    } else if (q === HIDE_PHRASE && HIDE_PHRASE.length > 0) {
      action = "hide";
    }
    return { action };
  });
}