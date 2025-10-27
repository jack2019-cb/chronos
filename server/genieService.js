let sampleService = require("./sampleService");
const { saveContentToFile } = require("./utils/fileUtils");
const normalizePrompt = require("./utils/normalizePrompt");
const { buildMockAiResponse } = require("./utils/aiMockResponse");
// dbUtils is a Prisma-backed shim present in the repo. Lazy-require inside
// functions that use it to avoid instantiating DB connections when not needed.

const ENABLE_PERSISTENCE = (() => {
  // Backwards-compat: if the flag is not set, keep persistence enabled to
  // preserve existing behavior (controller previously persisted). When the
  // flag is explicitly set to "0"/"false" persistence can be disabled.
  if (typeof process.env.GENIE_PERSISTENCE_ENABLED === "undefined") return true;
  return (
    process.env.GENIE_PERSISTENCE_ENABLED === "1" ||
    process.env.GENIE_PERSISTENCE_ENABLED === "true"
  );
})();

const AWAIT_PERSISTENCE = (() => {
  if (process.env.NODE_ENV === "test") return true;
  return (
    process.env.GENIE_PERSISTENCE_AWAIT === "1" ||
    process.env.GENIE_PERSISTENCE_AWAIT === "true"
  );
})();

const genieService = {
  // For the demo, generate delegates to sampleService. In future this can
  // orchestrate real AI/image jobs via aetherService.
  async generate(prompt) {
    if (!prompt || !String(prompt).trim()) {
      const e = new Error("Prompt is required");
      // @ts-ignore
      e.status = 400;
      throw e;
    }

    // If persistence/lookup is enabled, attempt a read-only DB lookup first.
    if (ENABLE_PERSISTENCE) {
      try {
        let dbUtils;
        // Debug: record which persistence implementation we'll use
        // eslint-disable-next-line no-console
        console.debug("genieService: selecting persistence implementation", {
          injected: typeof _injectedDbUtils !== "undefined",
          nodeEnv: process.env.NODE_ENV,
        });
        try {
          dbUtils =
            typeof _injectedDbUtils !== "undefined"
              ? _injectedDbUtils
              : require("./utils/dbUtils");
        } catch (e) {
          // If Prisma-backed dbUtils is not available (dev/test without
          // prisma generate), fall back to legacy sqlite `crud` to keep
          // runtime/tests stable. This preserves non-fatal persistence
          // semantics while migrations/Prisma rollout completes.
          // eslint-disable-next-line no-console
          console.warn(
            "genieService: dbUtils unavailable, falling back to legacy crud",
            e && e.message
          );
          try {
            dbUtils = require("./crud");
          } catch (err2) {
            // Re-throw original error if fallback also unavailable
            throw e;
          }
        }
        const norm = normalizePrompt(prompt);
        // Try to find a prompt with matching normalized text. dbUtils.getPrompts
        // returns recent prompts; keep this read-only and non-fatal.
        const prompts = await dbUtils.getPrompts();
        const match = (prompts || []).find((p) => {
          try {
            return (
              typeof p.prompt === "string" && normalizePrompt(p.prompt) === norm
            );
          } catch (e) {
            return false;
          }
        });

        if (match && match.id) {
          // Load latest AI result for this prompt id.
          try {
            // Prefer direct AI result lookup when available
            const aiRow = await dbUtils
              .getAIResultById(match.id)
              .catch(() => null);
            if (aiRow && aiRow.result) {
              const resultObj =
                typeof aiRow.result === "string"
                  ? JSON.parse(aiRow.result)
                  : aiRow.result;
              // Ensure cached results follow the same envelope shape as
              // freshly-generated results: always include content.layout
              // and a metadata object so callers/tests can rely on the
              // contract.
              const content = resultObj.content || resultObj || {};
              if (!content.layout) content.layout = "poem-single-column";
              const metadata = resultObj.metadata || {
                model: "cached-1",
                tokens: Math.max(
                  10,
                  Math.min(200, String(match.prompt || "").length)
                ),
              };

              return {
                success: true,
                data: {
                  content,
                  copies: resultObj.copies || [],
                  metadata,
                  promptId: match.id,
                  resultId: aiRow.id,
                },
              };
            }
          } catch (e) {
            // non-fatal; fall through to generation
          }
        }
      } catch (e) {
        // Non-fatal: log and fall back to generation
        // eslint-disable-next-line no-console
        console.warn("genieService: read-only lookup failed", e && e.message);
      }
    }

    // Synchronous demo service - wrap in Promise to keep async contract
    try {
      const svc =
        typeof _injectedSampleService !== "undefined"
          ? _injectedSampleService
          : sampleService;
      const result = await svc.generateFromPrompt(prompt);

      // Ensure returned envelope includes expected fields (metadata, layout)
      const content = result.content || {};
      if (!content.layout) content.layout = "poem-single-column";
      const metadata = result.metadata || {
        model: "mock-1",
        tokens: Math.max(10, Math.min(200, String(prompt || "").length)),
      };

      // Build a backward-compatible output envelope and include a richer
      // aiResponse envelope that can be multi-page. Use copies from the
      // generator when present, otherwise generate pages via helper.
      const pagesCount =
        (result && typeof result.pages === "number" && result.pages) ||
        (result && Array.isArray(result.copies) && result.copies.length) ||
        undefined;

      // Preserve canonical content when provided by the sampleService.
      // Build aiResponse pages around that canonical content.
      const baseContent = result && result.content ? result.content : null;
      const mock = buildMockAiResponse(prompt, {
        pages: pagesCount,
        model: metadata.model,
      });

      if (baseContent) {
        // Use provided content as canonical content
        mock.content = {
          title: baseContent.title || mock.content.title,
          body: baseContent.body || mock.content.body,
          layout: baseContent.layout || mock.content.layout,
        };
      }

      // Prefer explicit pages from sampleService (copies) when provided
      if (result && Array.isArray(result.copies) && result.copies.length > 0) {
        mock.aiResponse.pages = result.copies.map((c) => ({
          title: c.title || mock.content.title,
          body: c.body || mock.content.body,
          layout: c.layout || mock.content.layout,
        }));
        mock.aiResponse.pageCount = mock.aiResponse.pages.length;
      }

      const out = {
        success: true,
        data: {
          content: mock.content,
          aiResponse: mock.aiResponse,
          copies: result.copies || [],
          metadata: mock.metadata,
        },
      };

      // If persistence is enabled, attempt to persist the prompt and AI result.
      // This is best-effort and must not block or fail the generation response.
      if (ENABLE_PERSISTENCE) {
        // Provide a Promise hook that tests can await to know when the
        // persistence attempt completes. This hook is optional and only used
        // by tests that set GENIE_PERSISTENCE_AWAIT=1.
        let persistenceResolver;
        let persistenceRejecter;
        const persistencePromise = new Promise((res, rej) => {
          persistenceResolver = res;
          persistenceRejecter = rej;
        });
        // Expose test hook
        genieService._lastPersistencePromise = persistencePromise;

        const runPersistence = async () => {
          try {
            let dbUtils;
            // If a test injected mock is present, prefer it. This keeps
            // unit tests deterministic by using the mock implementations.
            if (typeof _injectedDbUtils !== "undefined") {
              dbUtils = _injectedDbUtils;
            } else if (process.env.NODE_ENV === "test") {
              // In test mode without an injected mock, prefer the legacy
              // sqlite-backed `crud` so API endpoints and persistence
              // operate against the same storage.
              dbUtils = require("./crud");
            } else {
              try {
                dbUtils = require("./utils/dbUtils");
              } catch (e) {
                // Fallback to legacy crud if Prisma-backed dbUtils unavailable
                // eslint-disable-next-line no-console
                console.warn(
                  "genieService: dbUtils unavailable in persistence step, falling back to legacy crud",
                  e && e.message
                );
                dbUtils = require("./crud");
              }
            }
            // Create prompt record with dedupe-on-create handling.
            try {
              let p;
              try {
                // Debug: log presence of createPrompt
                // eslint-disable-next-line no-console
                console.debug(
                  "genieService: dbUtils.createPrompt available?",
                  typeof dbUtils.createPrompt
                );
                p = await dbUtils.createPrompt(String(prompt));
                // eslint-disable-next-line no-console
                console.debug("genieService: createPrompt returned", p);
              } catch (createErr) {
                // If create failed due to a uniqueness/constraint error,
                // attempt to recover by searching for an existing prompt
                // that matches the normalized text. This avoids throwing
                // when concurrent requests race to create the same prompt.
                // Normalize and search recent prompts for a match.
                try {
                  const norm = normalizePrompt(prompt);
                  let recent = [];
                  try {
                    recent = await dbUtils.getPrompts();
                  } catch (dbErr) {
                    // Best-effort recovery: if DB not ready or query fails,
                    // log and continue with empty recent list so we don't
                    // surface an unhandled rejection from persistence.
                    // eslint-disable-next-line no-console
                    console.warn(
                      "genieService: recovery getPrompts failed",
                      dbErr && dbErr.message
                    );
                    recent = [];
                  }
                  const found = (recent || []).find((r) => {
                    try {
                      return (
                        typeof r.prompt === "string" &&
                        normalizePrompt(r.prompt) === norm
                      );
                    } catch (e) {
                      return false;
                    }
                  });
                  if (found && found.id) {
                    p = { id: found.id };
                  } else {
                    // Re-throw original create error if we couldn't recover
                    throw createErr;
                  }
                } catch (recoverErr) {
                  // Log recovery failure and rethrow original create error
                  // eslint-disable-next-line no-console
                  console.warn(
                    "genieService: createPrompt failed and recovery failed",
                    createErr && createErr.message,
                    recoverErr && recoverErr.message
                  );
                  throw createErr;
                }
              }

              if (p && p.id) out.data.promptId = p.id;

              // Debug: log created prompt and verify it can be read back
              try {
                // If crud-like API available, attempt to read back the prompt
                if (dbUtils && typeof dbUtils.getPromptById === "function") {
                  const verify = await dbUtils
                    .getPromptById(p.id)
                    .catch(() => null);
                  // eslint-disable-next-line no-console
                  console.debug(
                    "genieService: persistence created prompt result:",
                    p,
                    "verify:",
                    verify
                  );
                } else {
                  // eslint-disable-next-line no-console
                  console.debug(
                    "genieService: persistence created prompt (no getPromptById):",
                    p
                  );
                }
              } catch (e) {
                // eslint-disable-next-line no-console
                console.warn(
                  "genieService: persistence verify failed",
                  e && e.message
                );
              }

              // Create AI result record linked to the prompt
              try {
                let aiRes = null;
                if (dbUtils && typeof dbUtils.createAIResult === "function") {
                  // Persist the full aiResponse envelope when available so the
                  // DB retains pages and metadata for future reads.
                  const toPersist = out.data.aiResponse || {
                    content: out.data.content,
                    copies: out.data.copies,
                  };
                  aiRes = await dbUtils.createAIResult(
                    out.data.promptId,
                    toPersist
                  );
                }
                if (aiRes && aiRes.id) out.data.resultId = aiRes.id;
              } catch (e) {
                // non-fatal: log and continue
                // eslint-disable-next-line no-console
                console.warn(
                  "genieService: failed to create AI result",
                  e && e.message
                );
              }
            } catch (e) {
              // non-fatal: log and continue
              // eslint-disable-next-line no-console
              console.warn(
                "genieService: failed to create prompt",
                e && e.message
              );
            }
            persistenceResolver();
          } catch (e) {
            // Non-fatal: log and ignore persistence failures
            // eslint-disable-next-line no-console
            console.warn(
              "genieService: persistence step failed",
              e && e.message
            );
            persistenceRejecter(e);
          } finally {
            // Clear the last persistence promise after it's settled
            setImmediate(() => {
              genieService._lastPersistencePromise = undefined;
            });
          }
        };

        if (AWAIT_PERSISTENCE) {
          // Await persistence synchronously (test-only mode)
          await runPersistence();
        } else {
          // Fire-and-forget for normal operation. Attach a catch to avoid
          // unhandled rejections escaping if persistence fails asynchronously.
          (async () => {
            try {
              await runPersistence();
            } catch (e) {
              // Non-fatal: log background persistence failure
              // eslint-disable-next-line no-console
              console.warn(
                "genieService: background persistence failed",
                e && e.message
              );
            }
          })();
        }
      }

      return out;
    } catch (err) {
      const e = new Error("Generation failed: " + (err && err.message));
      // @ts-ignore
      e.status = 500;
      throw e;
    }
  },

  readLatest() {
    try {
      const { readLatest } = require("./utils/fileUtils");
      return readLatest();
    } catch (e) {
      return null;
    }
  },

  // Backwards-compatible wrapper that delegates to utils/fileUtils
  saveContentToFile(content) {
    return saveContentToFile(content);
  },

  /**
   * Read persisted canonical content for a prompt id.
   * Returns an object like: { content, copies, metadata, promptId, resultId, normalizedHash }
   */
  async getPersistedContent(promptId) {
    if (!promptId) {
      const e = new Error("promptId required");
      // @ts-ignore
      e.status = 400;
      throw e;
    }

    try {
      let dbUtils;
      try {
        dbUtils = require("./utils/dbUtils");
      } catch (e) {
        // Fallback to legacy crud if dbUtils not available
        try {
          dbUtils = require("./crud");
        } catch (err) {
          throw e;
        }
      }

      // Prefer using Prisma directly if available to find the latest aiResult
      if (dbUtils && typeof dbUtils._getPrisma === "function") {
        const prisma = dbUtils._getPrisma();
        try {
          const aiRow = await prisma.aIResult.findFirst({
            where: { promptId: Number(promptId) },
            orderBy: { createdAt: "desc" },
          });
          if (aiRow && aiRow.result) {
            const resultObj =
              typeof aiRow.result === "string"
                ? JSON.parse(aiRow.result)
                : aiRow.result;
            const content = resultObj.content || resultObj || {};
            const metadata = resultObj.metadata || {};
            return {
              content,
              copies: resultObj.copies || [],
              metadata,
              promptId: Number(promptId),
              resultId: aiRow.id,
              normalizedHash: resultObj.normalizedHash || null,
            };
          }
        } catch (e) {
          // ignore and fall through to dbUtils helper
        }
      }

      // Fallback: if dbUtils exposes a getAIResultById or other helpers
      if (dbUtils && typeof dbUtils.getAIResultById === "function") {
        // getAIResultById expects an id; try to find via prompts list
        const prompts = await dbUtils.getPrompts();
        const found = (prompts || []).find(
          (p) => Number(p.id) === Number(promptId)
        );
        if (found && found.id) {
          const aiRows = await dbUtils
            .getAIResultById(found.id)
            .catch(() => null);
          if (aiRows && aiRows.result) {
            const resultObj =
              typeof aiRows.result === "string"
                ? JSON.parse(aiRows.result)
                : aiRows.result;
            const content = resultObj.content || resultObj || {};
            return {
              content,
              copies: resultObj.copies || [],
              metadata: resultObj.metadata || {},
              promptId: found.id,
              resultId: aiRows.id,
              normalizedHash: resultObj.normalizedHash || null,
            };
          }
        }
      }

      // Not found
      const e = new Error("persisted content not found");
      // @ts-ignore
      e.status = 404;
      throw e;
    } catch (err) {
      // Re-throw
      throw err;
    }
  },
};

module.exports = genieService;

// Test helpers: allow injecting a mock dbUtils or sample service for unit tests
let _injectedDbUtils;
let _injectedSampleService;
module.exports._setDbUtils = (m) => {
  _injectedDbUtils = m;
};
module.exports._resetDbUtils = () => {
  _injectedDbUtils = undefined;
};
module.exports._setSampleService = (m) => {
  _injectedSampleService = m;
};
module.exports._resetSampleService = () => {
  _injectedSampleService = undefined;
};
