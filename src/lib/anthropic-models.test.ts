import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ANTHROPIC_MODEL,
  PREFERRED_CHAT_MODELS,
  PREFERRED_SONNET_MODELS,
  RETIRED_ANTHROPIC_MODEL_IDS,
  configuredAnthropicModel,
  configuredTranscriptModel,
  isChatModel,
  isRetiredAnthropicModel,
  isSonnetModel,
  pickPreferredModel,
  resolveAnthropicModelsToTry,
} from "./anthropic-models";

describe("anthropic-models", () => {
  const prevModel = process.env.ANTHROPIC_MODEL;
  const prevTranscript = process.env.ANTHROPIC_TRANSCRIPT_MODEL;

  afterEach(() => {
    if (prevModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = prevModel;
    if (prevTranscript === undefined) {
      delete process.env.ANTHROPIC_TRANSCRIPT_MODEL;
    } else {
      process.env.ANTHROPIC_TRANSCRIPT_MODEL = prevTranscript;
    }
  });

  it("uses a shared current default that both AI routes prefer", () => {
    expect(DEFAULT_ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
    expect(isRetiredAnthropicModel(DEFAULT_ANTHROPIC_MODEL)).toBe(false);
    expect(PREFERRED_SONNET_MODELS[0]).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(PREFERRED_CHAT_MODELS[0]).toBe("claude-opus-5");
    expect(PREFERRED_CHAT_MODELS).toContain("claude-haiku-5-5");
  });

  it("does not list retired Anthropic ids in preferred candidates", () => {
    const preferred = [...PREFERRED_SONNET_MODELS, ...PREFERRED_CHAT_MODELS];
    for (const id of preferred) {
      expect(isRetiredAnthropicModel(id), id).toBe(false);
    }
    expect(preferred).not.toContain("claude-3-5-sonnet-20241022");
    expect(preferred).not.toContain("claude-3-5-sonnet-20240620");
    expect(preferred).not.toContain("claude-3-7-sonnet-20250219");
    expect(preferred).not.toContain("claude-3-7-sonnet-latest");
    expect(preferred).not.toContain("claude-3-5-haiku-20241022");
    expect(preferred).not.toContain("claude-3-haiku-20240307");
    expect(preferred).not.toContain("claude-sonnet-4-5");
    expect(preferred).not.toContain("claude-sonnet-4-5-20250929");
    expect(preferred).not.toContain("claude-haiku-4-5-20251001");
  });

  it("recognizes retired model ids that used to 404 refine-transcript", () => {
    expect(RETIRED_ANTHROPIC_MODEL_IDS).toContain(
      "claude-3-5-sonnet-20241022"
    );
    expect(RETIRED_ANTHROPIC_MODEL_IDS).toContain("claude-sonnet-4-5");
    expect(RETIRED_ANTHROPIC_MODEL_IDS).toContain(
      "claude-sonnet-4-5-20250929"
    );
    expect(isRetiredAnthropicModel("claude-3-5-sonnet-20241022")).toBe(true);
    expect(isRetiredAnthropicModel("claude-3-5-sonnet-20240620")).toBe(true);
    expect(isRetiredAnthropicModel("claude-3-7-sonnet-latest")).toBe(true);
    expect(isRetiredAnthropicModel("claude-3-5-haiku-20241022")).toBe(true);
    expect(isRetiredAnthropicModel("claude-3-haiku-20240307")).toBe(true);
    expect(isRetiredAnthropicModel("claude-sonnet-4-5")).toBe(true);
    expect(isRetiredAnthropicModel("claude-sonnet-5-5")).toBe(false);
  });

  it("prefers ANTHROPIC_TRANSCRIPT_MODEL over ANTHROPIC_MODEL for refine", () => {
    process.env.ANTHROPIC_TRANSCRIPT_MODEL = "claude-sonnet-4-6";
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
    expect(configuredTranscriptModel()).toBe("claude-sonnet-4-6");
    expect(configuredAnthropicModel()).toBe("claude-sonnet-5-5");
  });

  it("ignores a retired ANTHROPIC_MODEL and falls back to the shared default", () => {
    process.env.ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";
    delete process.env.ANTHROPIC_TRANSCRIPT_MODEL;
    expect(configuredAnthropicModel()).toBeUndefined();
    expect(configuredTranscriptModel()).toBeUndefined();

    const models = resolveAnthropicModelsToTry({
      configuredModels: [configuredTranscriptModel()],
      preferredCandidates: PREFERRED_SONNET_MODELS,
      allow: isSonnetModel,
    });
    expect(models[0]).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(models).not.toContain("claude-3-5-sonnet-20241022");
  });

  it("never tries retired ids even when cached, configured, or discovered", () => {
    const models = resolveAnthropicModelsToTry({
      cachedWorkingModel: "claude-3-5-sonnet-20241022",
      configuredModels: [
        "claude-3-5-sonnet-20241022",
        "claude-3-7-sonnet-latest",
        "claude-sonnet-4-5",
      ],
      preferredCandidates: PREFERRED_SONNET_MODELS,
      discoveredIds: [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-sonnet-20240620",
        "claude-sonnet-4-5",
        "claude-opus-5",
      ],
      allow: isSonnetModel,
    });

    expect(models).toEqual([...PREFERRED_SONNET_MODELS]);
    expect(models.every((id) => !isRetiredAnthropicModel(id))).toBe(true);
    expect(models.every(isSonnetModel)).toBe(true);
    expect(models).not.toContain("claude-opus-5");
  });

  it("keeps fill-form discovery-first order and skips retired fallbacks", () => {
    const models = resolveAnthropicModelsToTry({
      configuredModels: [configuredAnthropicModel()],
      preferredCandidates: PREFERRED_CHAT_MODELS,
      discoveredIds: ["claude-haiku-5-5", "claude-3-haiku-20240307"],
      allow: isChatModel,
      preferDiscoveredFirst: true,
    });
    expect(models[0]).toBe("claude-haiku-5-5");
    expect(models).not.toContain("claude-3-haiku-20240307");
  });

  it("pickPreferredModel skips retired available ids", () => {
    expect(
      pickPreferredModel(
        ["claude-3-5-sonnet-20241022", "claude-sonnet-5-5"],
        PREFERRED_SONNET_MODELS,
        isSonnetModel
      )
    ).toBe("claude-sonnet-5-5");
  });
});
