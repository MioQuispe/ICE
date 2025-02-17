import { IDL } from "@dfinity/candid"
import { Principal } from "@dfinity/principal"
import type { DfxJson } from "./types/schema.js"
import type {
  AssetSpecificProperties,
  CanisterConfiguration,
  ConfigDefaults,
  ConfigNetwork,
  DfxVersion,
  MotokoSpecificProperties,
  Profile,
  RustSpecificProperties,
} from "./types/schema.js"
import fs from "node:fs"
import {
  Actor,
  type ActorSubclass,
  Agent,
  type HttpAgent,
  type Identity,
  type SignIdentity,
} from "@dfinity/agent"
import { idlFactory } from "./canisters/management_latest/management.did.js"
import { Ed25519KeyIdentity } from "@dfinity/identity"
import * as os from "node:os"
import find from "find-process"
import { principalToAccountId } from "./utils/utils.js"
import {
  Effect,
  Data,
  Layer,
  ManagedRuntime,
  Logger,
  Config,
  ConfigProvider,
  Context,
  Stream,
  Sink,
  Match,
  Chunk,
  Cache,
  type Runtime,
  Option,
  LogLevel,
  Duration,
} from "effect"
import { Schema, ParseResult } from "@effect/schema"
import { NodeContext, NodeFileSystem, NodeRuntime } from "@effect/platform-node"
import {
  Path,
  HttpClient,
  FileSystem,
  Command,
  CommandExecutor,
  Terminal,
  PlatformLogger,
} from "@effect/platform"
// TODO: create abstraction after pic-js is done
// import { ICService } from "./services/ic.js"
import { DfxService } from "./services/dfx.js"
import type {
  Task,
  Scope,
  BuilderResult,
  TaskTree,
  TaskTreeNode,
  CrystalContext,
  CrystalConfigFile,
} from "./types/types.js"
import { Moc } from "./services/moc.js"
import { runCli } from "./cli/index.js"
import { TaskRegistry } from "./services/taskRegistry.js"
import type * as ActorTypes from "./types/actor.js"
import { CrystalConfigService } from "./services/crystalConfig.js"
export * from "./builders/index.js"
// export * from "./plugins/withContext.js"

import * as didc from "didc_js"
import { Tags } from "./builders/types.js"
import { deployTaskPlugin } from "./plugins/deploy.js"
import { candidUITaskPlugin } from "./plugins/candid_ui.js"
import { sha256 } from "js-sha256"
import {
  canister_status_result,
  type log_visibility,
} from "./canisters/management_latest/management.types.js"
export const configMap = new Map([
  ["APP_DIR", fs.realpathSync(process.cwd())],
  ["DFX_CONFIG_FILENAME", "crystal.config.ts"],
  ["CANISTER_IDS_FILENAME", "canister_ids.json"],
  // TODO: IC_PORT / IC_HOST
  ["DFX_PORT", "8080"],
  ["DFX_HOST", "http://0.0.0.0"],
  ["REPLICA_PORT", "8080"],
])

export const configLayer = Layer.setConfigProvider(
  ConfigProvider.fromMap(configMap),
)

export class DeploymentError extends Data.TaggedError("DeploymentError")<{
  message: string
}> {}

export class ConfigError extends Data.TaggedError("ConfigError")<{
  message: string
}> {}

type ManagementActor = import("@dfinity/agent").ActorSubclass<
  import("./canisters/management_new/management.types.js")._SERVICE
>

// export type TaskCtxShape = Context.Tag.Service<typeof TaskCtx>
export type TaskCtxShape<
  D extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly network: string
  networks?: {
    [k: string]: ConfigNetwork
  } | null
  readonly subnet: string
  readonly agent: HttpAgent
  readonly identity: SignIdentity
  readonly users: {
    [name: string]: {
      identity: Identity
      agent: HttpAgent
      principal: Principal
      accountId: string
      // TODO: neurons?
    }
  }
  readonly runTask: typeof runTask
  readonly dependencies: D
}

export class TaskCtx extends Context.Tag("TaskCtx")<TaskCtx, TaskCtxShape>() {
  static Live = Layer.effect(
    TaskCtx,
    Effect.gen(function* () {
      // TODO: should be dynamically determined, whether this or pocket-ic?
      const { agent, identity } = yield* DfxService
      // const crystalConfig = yield* getCrystalConfig()
      // TODO: get layers or runtime? we need access to the tasks dependencies here

      return {
        // TODO: get from config?
        network: "local",
        subnet: "system",
        agent,
        identity,
        runTask,
        dependencies: {},
        users: {
          default: {
            identity,
            agent,
            // TODO: use Account class from connect2ic?
            principal: identity.getPrincipal(),
            accountId: principalToAccountId(identity.getPrincipal()),
          },
        },
      }
    }),
  )
}

// TODO: just one place to define this
export type Opt<T> = [T] | []
export const Opt = <T>(value?: T): Opt<T> => {
  return value || value === 0 ? [value] : []
}

export const getCanisterInfo = (canisterId: string) =>
  Effect.gen(function* () {
    const { mgmt } = yield* DfxService
    // TODO: get from environment
    const canisterInfo = yield* Effect.tryPromise({
      try: async () => {
        // TODO: this might not be defined. where do we get it from?
        if (!canisterId) {
          return { status: "not_installed" }
        }
        try {
          return await mgmt.canister_status({
            canister_id: Principal.fromText(canisterId),
          })
        } catch (error) {
          return { status: "not_installed" }
        }
      },
      catch: (error) => {
        return error
      },
    })

    // if (result.module_hash.length > 0) {
    //   console.log(
    //     `Canister ${canisterName} is already installed. Skipping deployment.`,
    //   )
    // }
    return canisterInfo
  })

export const createCanister = (canisterId?: string) =>
  Effect.gen(function* () {
    const { mgmt, identity } = yield* DfxService
    const createResult = yield* Effect.tryPromise({
      try: () =>
        // mgmt.create_canister({
        //   settings: [
        //     {
        //       compute_allocation: Opt<bigint>(),
        //       memory_allocation: Opt<bigint>(),
        //       freezing_threshold: Opt<bigint>(),
        //       controllers: Opt<Principal[]>([identity.getPrincipal()]),
        //       reserved_cycles_limit: Opt<bigint>(),
        //       log_visibility: Opt<log_visibility>(),
        //       wasm_memory_limit: Opt<bigint>(),
        //     },
        //   ],
        //   sender_canister_version: Opt<bigint>(0n),
        // })
        // TODO: this only works on local
        mgmt.provisional_create_canister_with_cycles({
          settings: [
            {
              compute_allocation: Opt<bigint>(),
              memory_allocation: Opt<bigint>(),
              freezing_threshold: Opt<bigint>(),
              controllers: Opt<Principal[]>([identity.getPrincipal()]),
              reserved_cycles_limit: Opt<bigint>(),
              log_visibility: Opt<log_visibility>(),
              wasm_memory_limit: Opt<bigint>(),
            },
          ],
          amount: Opt<bigint>(1_000_000_000_000_000_000n),
          // TODO: dont generate here. because it doesnt work on mainnet
          // instead expose the canisterId in the context for tasks which require it
          // could be through dependencies
          specified_id: Opt<Principal>(
            canisterId ? Principal.fromText(canisterId) : undefined,
          ),
          sender_canister_version: Opt<bigint>(0n),
        }) as Promise<{ canister_id: Principal }>,
      catch: (error) =>
        new DeploymentError({
          message: `Failed to create canister: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
    return createResult.canister_id.toText()
  })

export const generateDIDJS = (canisterName: string, didPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const appDir = yield* Config.string("APP_DIR")
    const didString = yield* fs.readFileString(didPath)
    const didJSString = didc.did_to_js(didString)
    const didJSPath = path.join(
      appDir,
      ".artifacts",
      canisterName,
      `${canisterName}.did.js`,
    )
    yield* fs.writeFile(didJSPath, Buffer.from(didJSString ?? "")) // TODO: check

    const canisterDID = yield* Effect.tryPromise({
      try: () => import(didJSPath),
      catch: (error) =>
        new DeploymentError({
          message: `Failed to import canister DID: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })

    if (!canisterDID) {
      return yield* Effect.fail(
        new DeploymentError({ message: "Failed to convert DID to JS" }),
      )
    }
    return canisterDID
  })

export const encodeArgs = (args: any[], canisterDID: any) => {
  const encodedArgs = args
    ? new Uint8Array(IDL.encode(canisterDID.init({ IDL }), args))
    : new Uint8Array()
  return encodedArgs
}
export const stopCanister = (canisterId: string) =>
  Effect.gen(function* () {
    const { mgmt } = yield* DfxService
    yield* Effect.tryPromise(() =>
      mgmt.stop_canister({
        canister_id: Principal.fromText(canisterId),
      }),
    )
  })

export const installCanister = ({
  encodedArgs,
  canisterId,
  wasmPath,
}: {
  encodedArgs: Uint8Array
  canisterId: string
  wasmPath: string
}) =>
  Effect.gen(function* () {
    const { mgmt } = yield* DfxService
    const fs = yield* FileSystem.FileSystem
    // TODO: we need to generate did.js before?

    // Prepare WASM module
    const wasmContent = yield* fs.readFile(wasmPath)
    const wasm = new Uint8Array(wasmContent)
    // TODO: check if chunking is needed
    // max size is 2MiB ? or is it
    //   Server returned an error:
    // Code: 413 (Payload Too Large)
    // Body: Request 0x11deb01f116d5065f83b7e6b0a4fc988440e08d73abaecba636b84e895feaac0 is too large. Message byte size 4709615 is larger than the max allowed 3670016.
    // Retrying request.
    const maxSize = 3670016
    const isOverSize = wasm.length > maxSize
    const wasmModuleHash = Array.from(sha256.array(wasm))
    // Install code
    yield* Effect.logInfo(`Installing code for ${canisterId} at ${wasmPath}`)
    if (isOverSize) {
      // TODO: proper error handling if fails?
      const chunkSize = 1048576
      // Maximum size: 1048576
      // export interface chunk_hash { 'hash' : Array<number> }
      const chunkHashes: Array<{ hash: Array<number> }> = []
      const chunkUploadEffects = [];
      for (let i = 0; i < wasm.length; i += chunkSize) {
        const chunk = wasm.slice(i, i + chunkSize);
        const chunkHash = Array.from(sha256.array(chunk));
        chunkHashes.push({ hash: chunkHash });
        chunkUploadEffects.push(
          Effect.tryPromise({
            try: () =>
              mgmt.upload_chunk({
                chunk: Array.from(chunk),
                canister_id: Principal.fromText(canisterId),
              }),
            catch: (error) =>
              new DeploymentError({
                message: `Failed to upload chunk: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }),
          }).pipe(
            Effect.tap(() =>
              Effect.logInfo(
                `Uploading chunk ${i} of ${wasm.length} for ${canisterId}`,
              ),
            ),
          ),
        );
      }
      yield* Effect.all(chunkUploadEffects, {
        concurrency: "unbounded",
      });
      // TODO: perform chunked install
      // mgmt.install_code({
      //   // arg: encodedArgs,
      //   arg: Array.from(encodedArgs),
      //   canister_id: Principal.fromText(canisterId),
      //   sender_canister_version: Opt<bigint>(),
      //   wasm_module: wasm,
      //   mode: { reinstall: null },
      // }),

      // export interface install_chunked_code_args {
      //   'arg' : Array<number>,
      //   'wasm_module_hash' : Array<number>,
      //   'mode' : canister_install_mode,
      //   'chunk_hashes_list' : Array<chunk_hash>,
      //   'target_canister' : canister_id,
      //   'store_canister' : [] | [canister_id],
      //   'sender_canister_version' : [] | [bigint],
      // }
      // mgmt.upload_chunk({
      //   // 'chunk' : Array<number>,
      //   // 'canister_id' : Principal,
      //   // The size of each chunk must be at most 1MiB.
      //   chunk: wasm,
      //   canister_id: Principal.fromText(canisterId),
      // })

      Effect.tryPromise({
        try: () =>
          mgmt.install_chunked_code({
            // arg: encodedArgs,
            //   mode: {
            //     install: null
            // },
            // target_canister: canisterId,
            // store_canister: None,
            // chunk_hashes_list: [{ hash: wasmModuleHash }],
            // wasm_module_hash: wasmModuleHash,
            // arg: Uint8Array.from([]),
            // sender_canister_version: None
            arg: Array.from(encodedArgs),
            target_canister: Principal.fromText(canisterId),
            sender_canister_version: Opt<bigint>(),
            // wasm_module: wasm,
            mode: { reinstall: null },
            chunk_hashes_list: chunkHashes,
            store_canister: [],
            wasm_module_hash: wasmModuleHash,
          }),
        catch: (error) =>
          new DeploymentError({
            message: `Failed to install code: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })
    } else {
      yield* Effect.tryPromise({
        try: () =>
          mgmt.install_code({
            // arg: encodedArgs,
            arg: Array.from(encodedArgs),
            canister_id: Principal.fromText(canisterId),
            sender_canister_version: Opt<bigint>(),
            wasm_module: Array.from(wasm),
            mode: { reinstall: null },
          }),
        catch: (error) =>
          new DeploymentError({
            message: `Failed to install code: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })
    }
    yield* Effect.logInfo(`Code installed for ${canisterId}`)
  })

export const compileMotokoCanister = (
  src: string,
  canisterName: string,
  wasmOutputFilePath: string,
) =>
  Effect.gen(function* () {
    const moc = yield* Moc
    // Create output directories if they don't exist
    yield* Effect.logInfo(`Compiling ${canisterName} to ${wasmOutputFilePath}`)
    // TODO: we need to make dirs if they don't exist
    yield* moc.compile(src, wasmOutputFilePath)
    yield* Effect.logInfo(
      `Successfully compiled ${src} ${canisterName} outputFilePath: ${wasmOutputFilePath}`,
    )
    return wasmOutputFilePath
  })

export const writeCanisterIds = (canisterName: string, canisterId: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const appDir = yield* Config.string("APP_DIR")
    const canisterIdsPath = path.join(appDir, "canister_ids.json")

    // TODO: should they be shared between dfx / pic-js?
    let canisterIds: {
      [canisterName: string]: {
        [network: string]: string
      }
    } = {}

    const exists = yield* fs.exists(canisterIdsPath)
    if (exists) {
      const content = yield* fs.readFileString(canisterIdsPath)
      canisterIds = yield* Effect.try({
        try: () => JSON.parse(content),
        catch: () => ({}),
      })
    }

    canisterIds[canisterName] = {
      ...canisterIds[canisterName],
      local: canisterId,
    }

    yield* fs.writeFile(
      canisterIdsPath,
      Buffer.from(JSON.stringify(canisterIds, null, 2)),
    )
  })

export const readCanisterIds = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const appDir = yield* Config.string("APP_DIR")
    const canisterIdsPath = path.join(appDir, "canister_ids.json")
    const content = yield* fs.readFileString(canisterIdsPath)
    return JSON.parse(content)
  })

export class TaskNotFoundError extends Data.TaggedError("TaskNotFoundError")<{
  path: string[]
  reason: string
}> {}

export const removeBuilders = (
  taskTree: TaskTree | TaskTreeNode,
): TaskTree | TaskTreeNode => {
  if ("_tag" in taskTree && taskTree._tag === "builder") {
    return removeBuilders(taskTree.done())
  }
  if ("_tag" in taskTree && taskTree._tag === "scope") {
    return {
      ...taskTree,
      children: Object.fromEntries(
        Object.entries(taskTree.children).map(([key, value]) => [
          key,
          removeBuilders(value),
        ]),
      ) as Record<string, TaskTreeNode>,
    }
  }
  if ("_tag" in taskTree && taskTree._tag === "task") {
    return taskTree
  }
  return Object.fromEntries(
    Object.entries(taskTree).map(([key, value]) => [
      key,
      removeBuilders(value),
    ]),
  ) as TaskTree
}

// TODO: support defaultTask for scope
export const findTaskInTaskTree = (
  obj: TaskTree,
  keys: Array<string>,
): Effect.Effect<Task, TaskNotFoundError> => {
  return Effect.gen(function* () {
    let node: TaskTreeNode | TaskTree = obj
    for (const key of keys) {
      const isLastKey = keys.indexOf(key) === keys.length - 1

      if (!("_tag" in node)) {
        if (isLastKey) {
          // TODO: this is all then
          const taskTree = node as TaskTree
          node = taskTree[key]

          if (node._tag === "task") {
            return node as Task
          } else if (node._tag === "scope") {
            if (Option.isSome((node as Scope).defaultTask)) {
              // TODO: fix
              // @ts-ignore
              const taskName = node.defaultTask.value
              return node.children[taskName] as Task
            }
          }

          return yield* Effect.fail(
            new TaskNotFoundError({
              path: keys,
              reason: `Invalid node type encountered at key "${key}"`,
            }),
          )
        } else {
          node = node[key]
        }
      } else {
        if (node._tag === "task") {
          if (isLastKey) {
            return node
          }
          return yield* Effect.fail(
            new TaskNotFoundError({
              path: keys,
              reason: `Invalid node type encountered at key "${key}"`,
            }),
          )
        } else if (node._tag === "scope") {
          if (isLastKey) {
            node = node.children[key]

            if (node._tag === "task") {
              return node
            }
            // yield* Effect.log("Option.isSome", {
            //   node,
            if (Option.isSome(node.defaultTask)) {
              const taskName = node.defaultTask.value
              // @ts-ignore
              return node.children[taskName] as Task
            }
            return yield* Effect.fail(
              new TaskNotFoundError({
                path: keys,
                reason: "No default task found for scope",
              }),
            )
          }
        }
        node = node.children[key] as TaskTreeNode
      }
    }
    return yield* Effect.fail(
      new TaskNotFoundError({
        path: keys,
        reason: "Path traversal completed without finding a task",
      }),
    )
  })
}

// TODO: more accurate type
type TaskFullName = string
// TODO: figure out if multiple tasks are needed
export const getTaskByPath = (taskPathString: TaskFullName) =>
  Effect.gen(function* () {
    const taskPath: string[] = taskPathString.split(":")
    const { taskTree, config } = yield* CrystalConfigService
    const task = yield* findTaskInTaskTree(taskTree, taskPath)
    return { task, config }
  })

// const fileLogger = Logger.logfmtLogger.pipe(
//   PlatformLogger.toFile("logs/crystal.log", { flag: "a" }),
// )
// const LoggerLive = Logger.replaceScoped(Logger.defaultLogger, fileLogger).pipe(
//   Layer.provide(NodeFileSystem.layer)
// )
// const fileLogger = Logger.logfmtLogger.pipe(
//   PlatformLogger.toFile("logs/crystal.log"),
// )
// const LoggerLive = Logger.addScoped(fileLogger).pipe(
//   Layer.provide(NodeFileSystem.layer),
// )
// Convert the fileLogger Effect into a Layer
// const FileLoggerLayer = Logger.zip(fileLogger)

// const mainLogger = Logger.zip(Logger.prettyLogger(), LoggerLive)

// const customLogger = Logger.make((ctx) => {
//   // console.log("attempting to serialize:", ctx)
//   fs.appendFileSync("logs/crystal.log", `${JSON.stringify(ctx, null, 2)}\n`)
// })

// TODO: layer memoization should work? do we need this?
const DfxLayer = DfxService.Live.pipe(
  Layer.provide(NodeContext.layer),
  Layer.provide(configLayer),
)
// TODO: construct later? or this is just defaults
export const DefaultsLayer = Layer.mergeAll(
  NodeContext.layer,
  DfxLayer,
  TaskRegistry.Live,
  // TODO: do not depend on DfxService directly?
  TaskCtx.Live.pipe(
    // Layer.provide(DfxService.Live),
    Layer.provide(DfxLayer),
    Layer.provide(NodeContext.layer),
  ),
  Moc.Live.pipe(Layer.provide(NodeContext.layer)),
  configLayer,
  // Logger.replace(Logger.defaultLogger, Logger.zip(Logger.pretty)),
  Logger.pretty,
  // Logger.replace(Logger.defaultLogger, Logger.jsonLogger), // Use jsonLogger
  CrystalConfigService.Live.pipe(Layer.provide(NodeContext.layer)),

  // TODO: set with flag?
  Logger.minimumLogLevel(LogLevel.Info),

  // Logger.add(customLogger),
  // Layer.effect(fileLogger),
  // LoggerLive,
  // fileLogger,
)
// TODO: construct later? or this is just defaults
export const TUILayer = Layer.mergeAll(
  NodeContext.layer,
  DfxLayer,
  TaskRegistry.Live,
  // TODO: do not depend on DfxService directly?
  TaskCtx.Live.pipe(
    // Layer.provide(DfxService.Live),
    Layer.provide(DfxLayer),
    Layer.provide(NodeContext.layer),
  ),
  Moc.Live.pipe(Layer.provide(NodeContext.layer)),
  configLayer,
  CrystalConfigService.Live.pipe(Layer.provide(NodeContext.layer)),
  // Logger.add(customLogger),
  // Layer.effect(fileLogger),
  // LoggerLive,
  // fileLogger,
)
export const runtime = ManagedRuntime.make(DefaultsLayer)

// export const runCLI = async () => {
//   const result = await runtime.runPromise(cliProgram)
//   console.log(result)
// }

export type LayerRequirements<L extends Layer.Layer<any, any, any>> =
  L extends Layer.Layer<infer R, any, any> ? R : never

// export const DependencyResultsArray = Context.Tag<DependencyResultsArray, any[]>("DependencyResultsArray") // Tag for the array
// export type DependencyResultsArrayShape = Context.Tag.Service<typeof DependencyResultsArray>

// class TaskNotFoundError extends Data.TaggedError("TaskNotFoundError")<{
//   message: string
// }> {}

// TODO: do we need to get by id? will symbol work?
export const getTaskPathById = (id: Symbol) =>
  Effect.gen(function* () {
    // TODO: initialize with all tasks
    const { taskTree } = yield* CrystalConfigService
    const result = yield* filterTasks(
      taskTree,
      (node) => node._tag === "task" && node.id === id,
    )
    // TODO: use effect Option?
    if (result?.[0]) {
      return result[0].path.join(":")
    }
    // return undefined
    return yield* Effect.fail(
      new TaskNotFoundError({
        reason: "Task not found by id",
        path: [""],
      }),
    )
  })

export const runTaskByPath = (taskPath: string) =>
  Effect.gen(function* () {
    const { task } = yield* getTaskByPath(taskPath)
    yield* runTask(task)
  })

export class DependencyResults extends Context.Tag("DependencyResults")<
  DependencyResults,
  {
    readonly dependencies: Record<string, unknown>
  }
>() {}

export class TaskInfo extends Context.Tag("TaskInfo")<
  TaskInfo,
  {
    readonly taskPath: string
  }
>() {}

class RunTaskError extends Data.TaggedError("RunTaskError")<{
  message: string
}> {}

// Type to extract success types from an array of Tasks
type DependencySuccessTypes<Dependencies extends Task<any, any, any>[]> = {
  [K in keyof Dependencies]: Dependencies[K] extends Task<infer A, any, any>
    ? A
    : never
}

export interface RunTaskOptions {
  forceRun?: boolean
}

export const runTask = <A, E, R, I>(
  task: Task<A, E, R, I>,
  options: RunTaskOptions = { forceRun: false },
): Effect.Effect<A, unknown, unknown> => {
  return Effect.gen(function* () {
    const cache = yield* TaskRegistry
    const taskPath = yield* getTaskPathById(task.id)
    yield* Effect.logInfo(`Running task: ${taskPath}`)

    // // const cacheKey = task.id
    // // 1. If there is already a cached result, return it immediately.
    // if (!options.forceRun && cache.contains(cacheKey)) {
    //   return yield* cache.get(cacheKey)
    // }
    // type DepsSuccessTypes = DependencySuccessTypes<T["dependencies"]>
    const dependencyResults: Record<string, unknown> = {}
    yield* Effect.logDebug("Running dependencies", {
      dependencies: task.provide,
      taskPath: taskPath,
    })
    const dependencyEffects = Object.entries(task.provide).map(
      ([dependencyName, dependency]) =>
        Effect.map(runTask(dependency), (result) => [
          dependencyName,
          result,
        ]) as Effect.Effect<[string, unknown], unknown, unknown>,
    )
    const results = yield* Effect.all(dependencyEffects, {
      concurrency: "unbounded",
    })
    results.forEach(([dependencyName, dependencyResult]) => {
      dependencyResults[dependencyName] = dependencyResult
    })

    const taskLayer = Layer.mergeAll(
      // configLayer,
      Layer.setConfigProvider(
        ConfigProvider.fromMap(new Map([...Array.from(configMap.entries())])),
      ),
    )

    // look here if cacheKey finds something. only after dependencies are run first
    // TODO: do we need access to dependencyResults inside the computeCacheKey?
    // const cacheKey = `${task.computeCacheKey ? task.computeCacheKey(task) : taskPath}:${taskPath}`
    const cacheKey = `${Option.match(task.computeCacheKey, {
      onSome: (computeCacheKey) => computeCacheKey(task),
      onNone: () => taskPath,
    })}:${taskPath}`
    // TODO: add taskPath
    const isCached = yield* cache.has(cacheKey)
    if (isCached && !options.forceRun) {
      return (yield* cache.get(cacheKey)) as A
    }

    const result = yield* task.effect.pipe(
      Effect.provide(taskLayer),
      Effect.provide(
        Layer.succeed(TaskInfo, {
          taskPath,
          // TODO: provide more?
        }),
      ),
      Effect.provide(
        Layer.succeed(DependencyResults, { dependencies: dependencyResults }),
      ),
    )
    // TODO: how do handle tasks which return nothing?
    yield* cache.set(cacheKey, result)

    return result
  })
}

export const filterTasks = (
  taskTree: TaskTree,
  predicate: (task: TaskTreeNode) => boolean,
  path: string[] = [],
): Effect.Effect<Array<{ task: TaskTreeNode; path: string[] }>> =>
  Effect.gen(function* () {
    const matchingNodes: Array<{ task: TaskTreeNode; path: string[] }> = []
    for (const key of Object.keys(taskTree)) {
      const currentNode = taskTree[key]
      const node = Match.value(currentNode).pipe(
        Match.tag("task", (task): Task => task),
        Match.tag("scope", (scope): Scope => scope),
        Match.option,
      )
      if (Option.isSome(node)) {
        const fullPath = [...path, key]
        if (predicate(node.value)) {
          matchingNodes.push({ task: node.value, path: fullPath })
        }
        if (node.value._tag === "scope") {
          const children = Object.keys(node.value.children)
          const filteredChildren = yield* filterTasks(
            node.value.children,
            predicate,
            fullPath,
          )
          matchingNodes.push(...filteredChildren)
        }
      }
    }
    return matchingNodes
  })

// const findTasksByTags = (config: CrystalConfigFile, tags: string[]) =>
//   Effect.gen(function* () {
//     return matchingTasks
//   })

export const canistersDeployTask = () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Running canisters:deploy")
    const { taskTree } = yield* CrystalConfigService
    const tasksWithPath = yield* filterTasks(
      taskTree,
      (node) =>
        node._tag === "task" &&
        node.tags.includes(Tags.CANISTER) &&
        node.tags.includes(Tags.DEPLOY),
    )
    yield* Effect.forEach(
      tasksWithPath,
      ({ path }) => runTaskByPath(path.join(":")),
      { concurrency: "unbounded" },
    )
  })

export const canistersCreateTask = () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Running canisters:create")
    const { taskTree } = yield* CrystalConfigService
    const tasksWithPath = yield* filterTasks(
      taskTree,
      (node) =>
        node._tag === "task" &&
        node.tags.includes(Tags.CANISTER) &&
        node.tags.includes(Tags.CREATE),
    )
    yield* Effect.forEach(
      tasksWithPath,
      ({ path }) => runTaskByPath(path.join(":")),
      { concurrency: "unbounded" },
    )
  })

export const canistersBuildTask = () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Running canisters:build")
    const { taskTree } = yield* CrystalConfigService
    const tasksWithPath = yield* filterTasks(
      taskTree,
      (node) =>
        node._tag === "task" &&
        node.tags.includes(Tags.CANISTER) &&
        node.tags.includes(Tags.BUILD),
    )
    yield* Effect.forEach(
      tasksWithPath,
      ({ path }) => runTaskByPath(path.join(":")),
      { concurrency: "unbounded" },
    )
  })

export const canistersBindingsTask = () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Running canisters:bindings")
    const { taskTree } = yield* CrystalConfigService
    const tasksWithPath = yield* filterTasks(
      taskTree,
      (node) =>
        node._tag === "task" &&
        node.tags.includes(Tags.CANISTER) &&
        node.tags.includes(Tags.BINDINGS),
    )
    yield* Effect.forEach(
      tasksWithPath,
      ({ path }) => runTaskByPath(path.join(":")),
      { concurrency: "unbounded" },
    )
  })

export const canistersInstallTask = () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Running canisters:install")
    const { taskTree } = yield* CrystalConfigService
    const tasksWithPath = yield* filterTasks(
      taskTree,
      (node) =>
        node._tag === "task" &&
        node.tags.includes(Tags.CANISTER) &&
        node.tags.includes(Tags.INSTALL),
    )
    yield* Effect.forEach(
      tasksWithPath,
      ({ path }) => runTaskByPath(path.join(":")),
      { concurrency: "unbounded" },
    )
  })

export const canistersStatusTask = () =>
  Effect.gen(function* () {
    const canisterIdsMap = yield* getCanisterIds
    const dfx = yield* DfxService
    // TODO: in parallel? are these tasks?
    // Create an effect for each canister that is wrapped with Effect.either
    const canisterStatusesEffects = Object.keys(canisterIdsMap).map(
      (canisterName) =>
        Effect.either(
          Effect.gen(function* () {
            const network = "local"
            const canisterInfo = canisterIdsMap[canisterName]
            const canisterId = canisterInfo[network]
            if (!canisterId) {
              throw new DeploymentError({
                message: `No canister ID found for ${canisterName} on network ${network}`,
              })
            }
            const status = yield* Effect.tryPromise({
              try: () =>
                dfx.mgmt.canister_status({
                  canister_id: Principal.fromText(canisterId),
                }),
              catch: (err) =>
                new DeploymentError({
                  message: `Failed to get status for ${canisterName}: ${
                    err instanceof Error ? err.message : String(err)
                  }`,
                }),
            })
            return { canisterName, canisterId, status }
          }),
        ),
    )

    const canisterStatuses = yield* Effect.all(canisterStatusesEffects, {
      concurrency: "unbounded",
    })
    // as Option.Option<
    //   Array<{
    //     canisterName: string
    //     canisterId: string
    //     status: canister_status_result
    //   }>
    // >
    // TODO: print module hash
    // For every result, inspect whether it was a success or a failure and prepare a log message accordingly

    // TODO: colorize statuses
    const statusLog = canisterStatuses
      .map((result) =>
        result._tag === "Right"
          ? `
${result.right.canisterName} status:
    ID: ${result.right.canisterId}
    Status: ${Object.keys(result.right.status.status)[0]}
    Memory Size: ${result.right.status.memory_size}
    Cycles: ${result.right.status.cycles}
    Idle Cycles Burned Per Day: ${result.right.status.idle_cycles_burned_per_day}
    Module Hash: ${
      result.right.status.module_hash.length > 0 ? "Present" : "Not Present"
    }`
          : `Error for canister: ${result.left.message}`,
      )
      .join("\n")

    yield* Effect.logInfo(statusLog)
  })

export const listTasksTask = () =>
  Effect.gen(function* () {
    // TODO: remove builders
    const { taskTree } = yield* CrystalConfigService
    const tasksWithPath = yield* filterTasks(
      taskTree,
      (node) => node._tag === "task",
    )
    // TODO: format nicely
    const taskList = tasksWithPath.map(({ task, path }) => {
      const taskPath = path.join(":") // Use colon to represent hierarchy
      return `  ${taskPath}` // Indent for better readability
    })

    const formattedTaskList = ["Available tasks:", ...taskList].join("\n")

    yield* Effect.logInfo(formattedTaskList)
  })

export const listCanistersTask = () =>
  Effect.gen(function* () {
    const { taskTree } = yield* CrystalConfigService
    const tasksWithPath = yield* filterTasks(
      taskTree,
      (node) => node._tag === "task" && node.tags.includes(Tags.CANISTER),
    )

    // TODO: format nicely
    const taskList = tasksWithPath.map(({ task, path }) => {
      const taskPath = path.join(":") // Use colon to represent hierarchy
      return `  ${taskPath}` // Indent for better readability
    })

    const formattedTaskList = ["Available canister tasks:", ...taskList].join(
      "\n",
    )

    yield* Effect.logInfo(formattedTaskList)
  })

export { runCli } from "./cli/index.js"

export const createActor = <T>({
  canisterId,
  canisterDID,
}: {
  canisterId: string
  canisterDID: any
}) =>
  Effect.gen(function* () {
    const { agent } = yield* DfxService
    const commandExecutor = yield* CommandExecutor.CommandExecutor
    // TODO: should be agnostic of dfx
    const getControllers = () => Promise.resolve()
    const addControllers = (controllers: Array<string>) =>
      Effect.gen(function* () {
        const command = Command.make(
          "dfx",
          "canister",
          "--network",
          "local",
          "update-settings",
          ...controllers.flatMap((c) => ["--add-controller", c]),
          canisterId,
        )
        yield* commandExecutor.start(command)
      })

    const setControllers = (controllers: Array<string>) =>
      Effect.gen(function* () {
        // TODO: dont depend on dfx
        const cyclesWalletCommand = Command.make(
          "dfx",
          "identity",
          "get-wallet",
        )
        const cyclesWallet = yield* Command.string(cyclesWalletCommand)

        // TODO: dont depend on dfx
        const command = Command.make(
          "dfx",
          "canister",
          "--network",
          "local",
          "update-settings",
          ...controllers.flatMap((c) => ["--set-controller", c]),
          "--set-controller",
          cyclesWallet.trim(),
          canisterId,
        )
        yield* commandExecutor.start(command)
      })

    return Actor.createActor<T>(canisterDID.idlFactory, {
      agent,
      canisterId,
    }) as ActorTypes.ActorSubclass<T>

    // TODO: ...?
    // return {
    //   actor: Actor.createActor(canisterDID.idlFactory, {
    //     agent,
    //     canisterId,
    //   }),
    //   canisterId,
    //   getControllers,
    //   addControllers,
    //   setControllers,
    // }
  })

const CanisterIdsSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Record({
    key: Schema.String,
    value: Schema.String,
  }),
})
export type CanisterIds = Schema.Schema.Type<typeof CanisterIdsSchema>
const decodeCanisterIds = Schema.decodeUnknown(CanisterIdsSchema)
// type CanisterIds = Schema.To<typeof CanisterIdsSchema>

export const getCanisterIds = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const appDir = yield* Config.string("APP_DIR")
  const canisterIdsFilename = yield* Config.string("CANISTER_IDS_FILENAME")
  const canisterIdsPath = path.join(appDir, canisterIdsFilename)

  const idsContent = yield* fs.readFileString(canisterIdsPath)
  const idsUnknown = yield* Effect.try({
    try: () => JSON.parse(idsContent),
    catch: () => new ConfigError({ message: "Failed to parse canister IDs" }),
  })
  const ids = yield* decodeCanisterIds(idsUnknown)
  const canisterIds = Object.keys(ids).reduce<CanisterIds>(
    (acc, canisterName) => {
      if (canisterName !== "__Candid_UI") {
        return { ...acc, [canisterName]: ids[canisterName] }
      }
      return acc
    },
    {},
  )

  return canisterIds
})

export { deployTaskPlugin } from "./plugins/deploy.js"
export { candidUITaskPlugin } from "./plugins/candid_ui.js"
