import { Effect } from "effect"
import { ICEConfigService } from "../services/iceConfig.js"
import { filterNodes, type ProgressUpdate } from "./lib.js"
import { runTaskByPath } from "./run.js"
import { Tags } from "../builders/types.js"


export const canistersBuildTask = (progressCb?: (update: ProgressUpdate<unknown>) => void) =>
  Effect.gen(function* () {
    yield* Effect.logDebug("Running canisters:build")
    const { taskTree } = yield* ICEConfigService
    const tasksWithPath = yield* filterNodes(
      taskTree,
      (node) =>
        node._tag === "task" &&
        node.tags.includes(Tags.CANISTER) &&
        node.tags.includes(Tags.BUILD),
    )
    yield* Effect.forEach(
      tasksWithPath,
      ({ path }) => runTaskByPath(path.join(":"), progressCb),
      { concurrency: "unbounded" },
    )
  })