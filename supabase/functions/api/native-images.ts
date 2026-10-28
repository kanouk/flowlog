// Native attachments only: never upload, fetch, or invoke the diary formatter.
export const imageArraySchema = {
  type: "array",
  maxItems: 5,
  uniqueItems: true,
  description:
    "Native image URLs; HTTPS only. Stored as supplied, never fetched or uploaded. Use direct image URLs such as https://i.gyazo.com/<id>.jpg. Credentials, whitespace, controls and backslashes are rejected. Canonically equivalent URLs (ignoring fragments) are duplicates. Empty array clears attachments.",
  items: {
    type: "string",
    format: "uri",
    pattern: "^https://",
    maxLength: 2048,
  },
};

export const expectedBlockSchema = {
  type: "object",
  required: ["content", "images", "occurred_at", "entry_id", "revision"],
  description:
    "Required when replacing images. Copy these values from the last block read; conflicts return 409 without writing.",
  properties: {
    content: { type: "string", nullable: true },
    images: {
      type: "array",
      items: { type: "string" },
      nullable: true,
      description: "Exact stored URLs from readback, including legacy URLs.",
    },
    revision: {
      type: "integer",
      minimum: 1,
      description: "Changes on every block edit, including edits in the UI.",
    },
    occurred_at: { type: "string", format: "date-time" },
    entry_id: { type: "string", format: "uuid" },
  },
};

export type ExpectedBlock = {
  revision: number;
  content: string | null;
  images: string[] | null;
  occurred_at: string;
  entry_id: string;
};

export function validateImages(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > 5) {
    return "images must be an array of at most 5 HTTPS URLs";
  }
  for (const item of value) {
    if (typeof item !== "string" || item.length > 2048) {
      return "Invalid image URL";
    }
    try {
      const url = new URL(item);
      if (
        !item.startsWith("https://") || url.protocol !== "https:" ||
        !url.hostname || url.username ||
        url.password || /[\s\\]/.test(item) ||
        Array.from(item).some((char) =>
          char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
        )
      ) return "Invalid image URL";
    } catch {
      return "Invalid image URL";
    }
  }
  return new Set(value.map((item) => {
      const url = new URL(item);
      url.hash = "";
      return url.href;
    })).size === value.length
    ? null
    : "Duplicate image URLs are not allowed";
}

export function isExpectedBlock(value: unknown): value is ExpectedBlock {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Number.isSafeInteger(v.revision) && Number(v.revision) >= 1 &&
    (typeof v.content === "string" || v.content === null) &&
    (v.images === null ||
      (Array.isArray(v.images) &&
        v.images.every((x) => typeof x === "string"))) &&
    typeof v.occurred_at === "string" &&
    isTimestamp(v.occurred_at) &&
    typeof v.entry_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v.entry_id,
    );
}

// Explicit offset required: no server-local timezone interpretation or rolled dates.
export function isTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/i
      .test(value)
  ) return false;
  if (
    !Number.isFinite(Date.parse(value)) || Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59
  ) return false;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function validateEvent(
  body: Record<string, unknown>,
  key?: string,
): string | null {
  if (typeof body.content !== "string" || !body.content) {
    return "content is required";
  }
  if (
    body.occurred_at !== undefined &&
    (!isTimestamp(body.occurred_at) ||
      Date.parse(body.occurred_at) > Date.now() + 300000)
  ) {
    return "occurred_at must be an ISO8601 timestamp with timezone, at most 5 minutes in the future";
  }
  if (
    body.tag !== undefined && body.tag !== null && typeof body.tag !== "string"
  ) return "tag must be a string or null";
  if (body.source !== undefined && typeof body.source !== "string") {
    return "source must be a string";
  }
  if (key !== undefined && !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
    return "Invalid Idempotency-Key (1-128 ASCII letters, digits, . _ : -)";
  }
  return body.images === undefined ? null : validateImages(body.images);
}
