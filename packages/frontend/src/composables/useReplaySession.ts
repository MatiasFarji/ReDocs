import { ref } from "vue";

import type { ProcessedRequest } from "../types/index.js";
import type { FrontendSDK } from "../types.js";
import { buildRawRequest } from "../utils";

export const useReplaySession = (sdk: FrontendSDK) => {
  const isCreating = ref(false);
  const creationProgress = ref("");

  const createReplaySessionsInFrontend = async (
    processedRequests: ProcessedRequest[],
    collectionName: string,
  ): Promise<number> => {
    isCreating.value = true;
    creationProgress.value = "Creating collection...";

    try {
      const existingNames = new Set(
        sdk.replay.getCollections().map((collection) => collection.name),
      );
      let finalCollectionName = collectionName;
      let counter = 1;
      while (existingNames.has(finalCollectionName) && counter < 100) {
        finalCollectionName = `${collectionName}${counter}`;
        counter++;
      }

      const collection = await sdk.replay.createCollection(finalCollectionName);

      let createdCount = 0;
      const sessionErrors: string[] = [];

      for (let index = 0; index < processedRequests.length; index++) {
        const item = processedRequests[index];
        if (item === undefined) continue;

        creationProgress.value = `Creating session ${index + 1}/${processedRequests.length}...`;

        const spec = item.spec;
        const beforeIds = new Set(
          sdk.replay.getSessions().map((session) => session.id),
        );

        try {
          await sdk.replay.createSession(
            {
              type: "Raw",
              raw: buildRawRequest(spec),
              connectionInfo: {
                host: spec.host ?? "example.com",
                port: spec.port ?? (spec.tls === false ? 80 : 443),
                isTLS: spec.tls !== false,
              },
            },
            collection.id,
          );
          createdCount++;

          const created = sdk.replay
            .getSessions()
            .find(
              (session) =>
                session.collectionId === collection.id &&
                !beforeIds.has(session.id),
            );
          if (created !== undefined) {
            await sdk.replay.renameSession(created.id, item.sessionName);
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          sessionErrors.push(`Session ${index + 1}: ${message}`);
        }
      }

      if (sessionErrors.length > 0) {
        console.warn("Some sessions failed to create:", sessionErrors);
        sdk.window.showToast(
          `${createdCount}/${processedRequests.length} sessions created. Check the console for details.`,
          { variant: "warning", duration: 6000 },
        );
      }

      return createdCount;
    } finally {
      isCreating.value = false;
      creationProgress.value = "";
    }
  };

  return {
    isCreating,
    creationProgress,
    createReplaySessionsInFrontend,
  };
};
