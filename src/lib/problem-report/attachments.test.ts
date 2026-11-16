import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  validateMagicBytes,
  validateAttachmentSize,
  isValidAttachmentMime,
  validateAttachmentCounts,
  getExtensionForMime,
  uploadAttachment,
  createSignedUploadUrl,
  insertBugAttachment,
  createRecordingGrant,
  verifyRecordingGrant,
  createUploadTicket,
  verifyUploadTicket,
  confirmSignedUpload,
  claimGrantNonce,
  ATTACHMENT_LIMITS,
} from "./attachments";

describe("attachments validation", () => {
  describe("validateMagicBytes", () => {
    it("validates PNG magic bytes", () => {
      const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(validateMagicBytes(validPng, "image/png")).toBe(true);

      const invalidPng = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(invalidPng, "image/png")).toBe(false);
    });

    it("validates JPEG magic bytes", () => {
      const validJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      expect(validateMagicBytes(validJpeg, "image/jpeg")).toBe(true);

      const invalidJpeg = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(invalidJpeg, "image/jpeg")).toBe(false);
    });

    it("validates WebP magic bytes", () => {
      const validWebp = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      expect(validateMagicBytes(validWebp, "image/webp")).toBe(true);
    });

    it("validates WebM magic bytes", () => {
      const validWebm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
      expect(validateMagicBytes(validWebm, "video/webm")).toBe(true);
    });

    it("validates MP4 magic bytes (ftyp)", () => {
      const validMp4 = new Uint8Array([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      ]);
      expect(validateMagicBytes(validMp4, "video/mp4")).toBe(true);
    });

    it("returns true for unknown mime types", () => {
      const data = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(data, "application/json")).toBe(true);
    });
  });

  describe("validateAttachmentSize", () => {
    it("accepts files within screenshot limit", () => {
      expect(validateAttachmentSize("screenshot", 1024)).toBe(true);
      expect(validateAttachmentSize("screenshot", ATTACHMENT_LIMITS.screenshot.maxBytes)).toBe(true);
    });

    it("rejects files over screenshot limit", () => {
      expect(validateAttachmentSize("screenshot", ATTACHMENT_LIMITS.screenshot.maxBytes + 1)).toBe(false);
    });

    it("accepts files within recording limit", () => {
      expect(validateAttachmentSize("recording", ATTACHMENT_LIMITS.recording.maxBytes)).toBe(true);
    });

    it("rejects files over recording limit", () => {
      expect(validateAttachmentSize("recording", ATTACHMENT_LIMITS.recording.maxBytes + 1)).toBe(false);
    });

    it("accepts files within techlog limit", () => {
      expect(validateAttachmentSize("techlog", ATTACHMENT_LIMITS.techlog.maxBytes)).toBe(true);
    });

    it("rejects files over techlog limit", () => {
      expect(validateAttachmentSize("techlog", ATTACHMENT_LIMITS.techlog.maxBytes + 1)).toBe(false);
    });
  });

  describe("isValidAttachmentMime", () => {
    it("validates screenshot mime types", () => {
      expect(isValidAttachmentMime("screenshot", "image/png")).toBe(true);
      expect(isValidAttachmentMime("screenshot", "image/jpeg")).toBe(true);
      expect(isValidAttachmentMime("screenshot", "image/webp")).toBe(true);
      expect(isValidAttachmentMime("screenshot", "image/gif")).toBe(false);
      expect(isValidAttachmentMime("screenshot", "video/webm")).toBe(false);
    });

    it("validates recording mime types", () => {
      expect(isValidAttachmentMime("recording", "video/webm")).toBe(true);
      expect(isValidAttachmentMime("recording", "video/mp4")).toBe(true);
      expect(isValidAttachmentMime("recording", "image/png")).toBe(false);
    });

    it("validates techlog mime types", () => {
      expect(isValidAttachmentMime("techlog", "application/json")).toBe(true);
      expect(isValidAttachmentMime("techlog", "text/plain")).toBe(false);
    });
  });

  describe("validateAttachmentCounts", () => {
    it("accepts valid counts", () => {
      expect(validateAttachmentCounts({ screenshots: 0, recordings: 0, techlogs: 0 })).toEqual({ ok: true });
      expect(validateAttachmentCounts({ screenshots: 3, recordings: 1, techlogs: 1 })).toEqual({ ok: true });
    });

    it("rejects too many screenshots", () => {
      const result = validateAttachmentCounts({ screenshots: 4, recordings: 0, techlogs: 0 });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("3");
    });

    it("rejects too many recordings", () => {
      const result = validateAttachmentCounts({ screenshots: 0, recordings: 2, techlogs: 0 });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("1");
    });

    it("rejects too many techlogs", () => {
      const result = validateAttachmentCounts({ screenshots: 0, recordings: 0, techlogs: 2 });
      expect(result.ok).toBe(false);
    });
  });

  describe("getExtensionForMime", () => {
    it("returns correct extensions", () => {
      expect(getExtensionForMime("image/png")).toBe("png");
      expect(getExtensionForMime("image/jpeg")).toBe("jpg");
      expect(getExtensionForMime("image/webp")).toBe("webp");
      expect(getExtensionForMime("video/webm")).toBe("webm");
      expect(getExtensionForMime("video/mp4")).toBe("mp4");
      expect(getExtensionForMime("application/json")).toBe("json");
      expect(getExtensionForMime("unknown/type")).toBe("bin");
    });
  });
});

describe("attachments storage operations", () => {
  const mockStorageUpload = vi.fn();
  const mockStorageCreateSignedUploadUrl = vi.fn();
  const mockStorageRemove = vi.fn();
  const mockDbInsert = vi.fn();

  function createMockClient() {
    return {
      storage: {
        from: () => ({
          upload: mockStorageUpload,
          createSignedUploadUrl: mockStorageCreateSignedUploadUrl,
          remove: mockStorageRemove,
        }),
      },
      from: () => ({
        insert: mockDbInsert,
      }),
    } as never;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageUpload.mockResolvedValue({ error: null });
    mockStorageCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: "https://example.com/upload", token: "test-token" },
      error: null,
    });
    mockDbInsert.mockResolvedValue({ error: null });
  });

  describe("uploadAttachment", () => {
    it("returns error when client is null", async () => {
      const result = await uploadAttachment("bug-123", { kind: "screenshot", data: new Uint8Array(), mime: "image/png" }, null);
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty("error", "storage_not_configured");
    });

    it("validates mime type", async () => {
      const result = await uploadAttachment(
        "bug-123",
        { kind: "screenshot", data: new Uint8Array(), mime: "video/webm" },
        createMockClient()
      );
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty("error", "invalid_mime_type");
    });

    it("validates file size", async () => {
      const largeData = new Uint8Array(ATTACHMENT_LIMITS.screenshot.maxBytes + 1);
      const result = await uploadAttachment(
        "bug-123",
        { kind: "screenshot", data: largeData, mime: "image/png" },
        createMockClient()
      );
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty("error", "file_too_large");
    });

    it("validates magic bytes", async () => {
      const badData = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
      const result = await uploadAttachment(
        "bug-123",
        { kind: "screenshot", data: badData, mime: "image/png" },
        createMockClient()
      );
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty("error", "invalid_file_content");
    });

    it("uploads valid screenshot", async () => {
      const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const result = await uploadAttachment(
        "bug-123",
        { kind: "screenshot", data: validPng, mime: "image/png" },
        createMockClient()
      );
      expect(result.ok).toBe(true);
      expect(mockStorageUpload).toHaveBeenCalled();
    });
  });

  describe("createSignedUploadUrl", () => {
    it("returns error when client is null", async () => {
      const result = await createSignedUploadUrl("bug-123", "recording", "video/webm", "user-1", null);
      expect(result.ok).toBe(false);
    });

    it("validates mime type", async () => {
      const result = await createSignedUploadUrl("bug-123", "recording", "image/png", "user-1", createMockClient());
      expect(result.ok).toBe(false);
    });

    it("creates signed URL for valid recording with upload ticket", async () => {
      process.env.UPLOAD_TICKET_SECRET = "test-secret-key-for-hmac-at-least-32-chars";
      const result = await createSignedUploadUrl("bug-123", "recording", "video/webm", "user-1", createMockClient());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.signedUrl).toBe("https://example.com/upload");
        expect(result.storagePath).toMatch(/^bug-123\/.+\.webm$/);
        expect(result.uploadTicket).toBeDefined();
        expect(result.uploadTicket).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });
  });

  describe("insertBugAttachment", () => {
    it("returns error when client is null", async () => {
      const result = await insertBugAttachment("bug-123", "screenshot", "path/file.png", "image/png", 1024, null);
      expect(result.ok).toBe(false);
    });

    it("inserts attachment row", async () => {
      const result = await insertBugAttachment(
        "bug-123",
        "screenshot",
        "bug-123/abc.png",
        "image/png",
        1024,
        createMockClient()
      );
      expect(result.ok).toBe(true);
      expect(mockDbInsert).toHaveBeenCalledWith({
        bug_id: "bug-123",
        kind: "screenshot",
        storage_path: "bug-123/abc.png",
        mime: "image/png",
        size_bytes: 1024,
      });
    });
  });
});

describe("recording grant and upload ticket security", () => {
  const TEST_SECRET = "a-secure-test-secret-key-at-least-32-chars-long";

  beforeEach(() => {
    process.env.UPLOAD_TICKET_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.UPLOAD_TICKET_SECRET;
  });

  describe("createRecordingGrant / verifyRecordingGrant", () => {
    it("creates and verifies a valid grant for the same user", () => {
      const grant = createRecordingGrant({
        bugId: "bug-123",
        userId: "user-1",
        mime: "video/webm",
      });
      expect(typeof grant).toBe("string");

      const result = verifyRecordingGrant(grant, "user-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.grant.bugId).toBe("bug-123");
        expect(result.grant.userId).toBe("user-1");
        expect(result.grant.mime).toBe("video/webm");
        expect(result.grant.typ).toBe("grant");
        expect(result.grant.nonce).toBeDefined();
      }
    });

    it("creates and verifies a valid MP4 grant for Safari", () => {
      const grant = createRecordingGrant({
        bugId: "bug-456",
        userId: "user-1",
        mime: "video/mp4",
      });

      const result = verifyRecordingGrant(grant, "user-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.grant.bugId).toBe("bug-456");
        expect(result.grant.mime).toBe("video/mp4");
      }
    });

    it("allows grant to be verified multiple times (claim happens in route)", () => {
      const grant = createRecordingGrant({
        bugId: "bug-789",
        userId: "user-1",
        mime: "video/webm",
      });

      const result1 = verifyRecordingGrant(grant, "user-1");
      expect(result1.ok).toBe(true);

      const result2 = verifyRecordingGrant(grant, "user-1");
      expect(result2.ok).toBe(true);
    });

    it("rejects grant when used by different user (foreign bugId protection)", () => {
      const grant = createRecordingGrant({
        bugId: "bug-123",
        userId: "user-1",
        mime: "video/webm",
      });

      const result = verifyRecordingGrant(grant, "user-2");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("user_mismatch");
      }
    });

    it("rejects tampered grant signature", () => {
      const grant = createRecordingGrant({
        bugId: "bug-123",
        userId: "user-1",
        mime: "video/webm",
      });

      const decoded = Buffer.from(grant, "base64url").toString("utf-8");
      const tampered = decoded.replace("bug-123", "bug-999");
      const tamperedToken = Buffer.from(tampered).toString("base64url");

      const result = verifyRecordingGrant(tamperedToken, "user-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("invalid_signature");
      }
    });

    it("rejects malformed grant", () => {
      const result = verifyRecordingGrant("not-a-valid-token", "user-1");
      expect(result.ok).toBe(false);
    });

    it("rejects ticket used as grant (typ mismatch)", () => {
      const ticket = createUploadTicket({
        bugId: "bug-123",
        storagePath: "bug-123/abc.webm",
        mime: "video/webm",
        userId: "user-1",
      });

      const result = verifyRecordingGrant(ticket, "user-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("invalid_type");
      }
    });
  });

  describe("createUploadTicket / verifyUploadTicket", () => {
    it("creates and verifies a valid ticket", () => {
      const ticket = createUploadTicket({
        bugId: "bug-123",
        storagePath: "bug-123/abc.webm",
        mime: "video/webm",
        userId: "user-1",
      });

      const result = verifyUploadTicket(ticket, "user-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ticket.bugId).toBe("bug-123");
        expect(result.ticket.storagePath).toBe("bug-123/abc.webm");
        expect(result.ticket.mime).toBe("video/webm");
        expect(result.ticket.typ).toBe("ticket");
      }
    });

    it("rejects ticket when used by different user", () => {
      const ticket = createUploadTicket({
        bugId: "bug-123",
        storagePath: "bug-123/abc.webm",
        mime: "video/webm",
        userId: "user-1",
      });

      const result = verifyUploadTicket(ticket, "user-2");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("user_mismatch");
      }
    });

    it("rejects grant used as ticket (typ mismatch)", () => {
      const grant = createRecordingGrant({
        bugId: "bug-123",
        userId: "user-1",
        mime: "video/webm",
      });

      const result = verifyUploadTicket(grant, "user-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("invalid_type");
      }
    });
  });

  describe("confirmSignedUpload idempotency", () => {
    const mockStorageList = vi.fn();
    const mockStorageRemove = vi.fn();
    const mockStorageCreateSignedUrl = vi.fn();
    const mockDbInsert = vi.fn();
    const mockDbSelect = vi.fn();

    const TEST_BUG_ID = "bug-2410211200-1";
    const TEST_UUID = "01234567-89ab-cdef-0123-456789abcdef";
    const TEST_STORAGE_PATH = `${TEST_BUG_ID}/${TEST_UUID}.webm`;
    const TEST_FILENAME = `${TEST_UUID}.webm`;

    function createMockClientWithExistingRow() {
      return {
        storage: {
          from: () => ({
            list: mockStorageList,
            remove: mockStorageRemove,
            createSignedUrl: mockStorageCreateSignedUrl,
          }),
        },
        from: () => ({
          insert: mockDbInsert,
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: mockDbSelect,
              }),
            }),
          }),
        }),
      } as never;
    }

    beforeEach(() => {
      vi.clearAllMocks();
      mockStorageList.mockResolvedValue({
        data: [{ name: TEST_FILENAME, metadata: { size: 1000, mimetype: "video/webm" } }],
        error: null,
      });
      mockStorageCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: "https://example.com/file" },
        error: null,
      });
      mockDbInsert.mockResolvedValue({ error: null });
    });

    it("returns ok and does not insert when row already exists for storage_path", async () => {
      mockDbSelect.mockResolvedValue({ data: { id: "existing-id" }, error: null });

      const ticket = createUploadTicket({
        bugId: TEST_BUG_ID,
        storagePath: TEST_STORAGE_PATH,
        mime: "video/webm",
        userId: "user-1",
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]).buffer),
      });

      const result = await confirmSignedUpload(ticket, "user-1", "recording", createMockClientWithExistingRow());

      expect(result.ok).toBe(true);
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it("inserts new row when no existing row for storage_path", async () => {
      mockDbSelect.mockResolvedValue({ data: null, error: null });

      const ticket = createUploadTicket({
        bugId: TEST_BUG_ID,
        storagePath: TEST_STORAGE_PATH,
        mime: "video/webm",
        userId: "user-1",
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]).buffer),
      });

      const mockClient = {
        storage: {
          from: () => ({
            list: mockStorageList,
            remove: mockStorageRemove,
            createSignedUrl: mockStorageCreateSignedUrl,
          }),
        },
        from: (table: string) => {
          if (table === "bug_attachments") {
            return {
              insert: mockDbInsert,
              select: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: mockDbSelect,
                  }),
                }),
              }),
            };
          }
          return { insert: mockDbInsert };
        },
      } as never;

      const result = await confirmSignedUpload(ticket, "user-1", "recording", mockClient);

      expect(result.ok).toBe(true);
      expect(mockDbInsert).toHaveBeenCalled();
    });
  });

  describe("confirmSignedUpload fail-closed validation", () => {
    const mockStorageList = vi.fn();
    const mockStorageRemove = vi.fn();
    const mockStorageCreateSignedUrl = vi.fn();
    const mockDbInsert = vi.fn();
    const mockDbSelect = vi.fn();

    const TEST_BUG_ID = "bug-2410211200-1";
    const TEST_UUID = "01234567-89ab-cdef-0123-456789abcdef";
    const TEST_STORAGE_PATH = `${TEST_BUG_ID}/${TEST_UUID}.webm`;
    const TEST_FILENAME = `${TEST_UUID}.webm`;

    function createMockClient() {
      return {
        storage: {
          from: () => ({
            list: mockStorageList,
            remove: mockStorageRemove,
            createSignedUrl: mockStorageCreateSignedUrl,
          }),
        },
        from: () => ({
          insert: mockDbInsert,
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: mockDbSelect,
              }),
            }),
          }),
        }),
      } as never;
    }

    beforeEach(() => {
      vi.clearAllMocks();
      mockDbSelect.mockResolvedValue({ data: null, error: null });
      mockDbInsert.mockResolvedValue({ error: null });
      mockStorageRemove.mockResolvedValue({ error: null });
    });

    it("rejects when magic bytes fetch fails (fail closed)", async () => {
      mockStorageList.mockResolvedValue({
        data: [{ name: TEST_FILENAME, metadata: { size: 1000, mimetype: "video/webm" } }],
        error: null,
      });
      mockStorageCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: "https://example.com/file" },
        error: null,
      });
      global.fetch = vi.fn().mockResolvedValue({ ok: false });

      const ticket = createUploadTicket({
        bugId: TEST_BUG_ID,
        storagePath: TEST_STORAGE_PATH,
        mime: "video/webm",
        userId: "user-1",
      });

      const result = await confirmSignedUpload(ticket, "user-1", "recording", createMockClient());

      expect(result.ok).toBe(false);
      expect(result.error).toBe("invalid_file_content");
      expect(mockStorageRemove).toHaveBeenCalled();
    });

    it("rejects when size is zero or missing", async () => {
      mockStorageList.mockResolvedValue({
        data: [{ name: TEST_FILENAME, metadata: { size: 0, mimetype: "video/webm" } }],
        error: null,
      });

      const ticket = createUploadTicket({
        bugId: TEST_BUG_ID,
        storagePath: TEST_STORAGE_PATH,
        mime: "video/webm",
        userId: "user-1",
      });

      const result = await confirmSignedUpload(ticket, "user-1", "recording", createMockClient());

      expect(result.ok).toBe(false);
      expect(result.error).toBe("invalid_size");
      expect(mockStorageRemove).toHaveBeenCalled();
    });

    it("rejects when contentType does not match ticket mime", async () => {
      mockStorageList.mockResolvedValue({
        data: [{ name: TEST_FILENAME, metadata: { size: 1000, mimetype: "video/mp4" } }],
        error: null,
      });

      const ticket = createUploadTicket({
        bugId: TEST_BUG_ID,
        storagePath: TEST_STORAGE_PATH,
        mime: "video/webm",
        userId: "user-1",
      });

      const result = await confirmSignedUpload(ticket, "user-1", "recording", createMockClient());

      expect(result.ok).toBe(false);
      expect(result.error).toBe("mime_mismatch");
      expect(mockStorageRemove).toHaveBeenCalled();
    });

    it("rejects when magic bytes do not match", async () => {
      mockStorageList.mockResolvedValue({
        data: [{ name: TEST_FILENAME, metadata: { size: 1000, mimetype: "video/webm" } }],
        error: null,
      });
      mockStorageCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: "https://example.com/file" },
        error: null,
      });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([0x00, 0x00, 0x00, 0x00]).buffer),
      });

      const ticket = createUploadTicket({
        bugId: TEST_BUG_ID,
        storagePath: TEST_STORAGE_PATH,
        mime: "video/webm",
        userId: "user-1",
      });

      const result = await confirmSignedUpload(ticket, "user-1", "recording", createMockClient());

      expect(result.ok).toBe(false);
      expect(result.error).toBe("invalid_file_content");
      expect(mockStorageRemove).toHaveBeenCalled();
    });
  });

  describe("claimGrantNonce", () => {
    const mockDbInsert = vi.fn();

    function createMockClient() {
      return {
        from: () => ({
          insert: mockDbInsert,
        }),
      } as never;
    }

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns ok when claim succeeds (first use)", async () => {
      mockDbInsert.mockResolvedValue({ error: null });

      const result = await claimGrantNonce("test-nonce-1", createMockClient());

      expect(result.ok).toBe(true);
      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket_key: "problem-report-grant:test-nonce-1",
        })
      );
    });

    it("returns already_used when unique violation (23505)", async () => {
      mockDbInsert.mockResolvedValue({
        error: { code: "23505", message: "duplicate key" },
      });

      const result = await claimGrantNonce("test-nonce-2", createMockClient());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("already_used");
      }
    });

    it("returns unavailable on other DB errors", async () => {
      mockDbInsert.mockResolvedValue({
        error: { code: "42P01", message: "relation does not exist" },
      });

      const result = await claimGrantNonce("test-nonce-3", createMockClient());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("unavailable");
      }
    });

    it("returns unavailable when client is null", async () => {
      const result = await claimGrantNonce("test-nonce-4", null);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("unavailable");
      }
    });
  });
});
