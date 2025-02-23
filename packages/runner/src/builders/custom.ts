import { Effect, Context, Data, Config, Match, Option } from "effect"
import type { ICEContext, Scope, Task, TaskTree } from "../types/types.js"
// import mo from "motoko"
import { Path, FileSystem } from "@effect/platform"
import type {
	CanisterBuilder,
	CanisterScope,
	UniformScopeCheck,
	MergeScopeDependencies,
	MergeScopeProvide,
	ExtractTaskEffectSuccess,
	ExtractProvidedDeps,
  TaskCtxShape,
} from "./types.js"
import { Tags } from "./types.js"
import { CanisterIdsService } from "../services/canisterIds.js"
import { instrumentActor } from "../utils/instrumentActor.js"
import { TaskInfo } from "../tasks/run.js"
import { TaskCtx } from "../tasks/lib.js"
import { DependencyResults } from "../tasks/run.js"
import { createActor, createCanister, deleteCanister, generateDIDJS, installCanister, stopCanister, encodeArgs } from "../canister.js"

// TODO: later
// candidUITaskPlugin()
// const plugins = <T extends TaskTreeNode>(taskTree: T) =>
//   deployTaskPlugin(taskTree)

type CustomCanisterConfig = {
	wasm: string
	candid: string
	canisterId?: string
}

export const iceDirName = ".ice"

export const makeStopTask = () => {
	return {
		_tag: "task",
		id: Symbol("customCanister/stop"),
		dependencies: {},
		provide: {},
		// TODO: do we allow a fn as args here?
		effect: Effect.gen(function* () {
			const path = yield* Path.Path
			const fs = yield* FileSystem.FileSystem
			const appDir = yield* Config.string("APP_DIR")
			const { taskPath } = yield* TaskInfo
			const canisterName = taskPath.split(":").slice(0, -1).join(":")
			// TODO: handle error
			const canisterId = yield* loadCanisterId(taskPath)
			yield* stopCanister(canisterId)
			yield* Effect.logDebug(`Stopped canister ${canisterName}`)
		}),
		description: "some description",
		// TODO: no tag custom
		tags: [Tags.CANISTER, Tags.STOP],
		computeCacheKey: Option.none(),
		input: Option.none(),
	} satisfies Task
}

export const makeDeleteTask = () => {
	return {
		_tag: "task",
		id: Symbol("customCanister/delete"),
		dependencies: {},
		provide: {},
		// TODO: do we allow a fn as args here?
		effect: Effect.gen(function* () {
			const path = yield* Path.Path
			const fs = yield* FileSystem.FileSystem
			const appDir = yield* Config.string("APP_DIR")
			const { taskPath } = yield* TaskInfo
			const canisterName = taskPath.split(":").slice(0, -1).join(":")
			// TODO: handle error
			const canisterId = yield* loadCanisterId(taskPath)
			yield* deleteCanister(canisterId)
			const canisterIdsService = yield* CanisterIdsService
			yield* canisterIdsService.removeCanisterId(canisterName)
			yield* Effect.logDebug(`Deleted canister ${canisterName}`)
		}),
		description: "some description",
		// TODO: no tag custom
		tags: [Tags.CANISTER, Tags.DELETE],
		computeCacheKey: Option.none(),
		input: Option.none(),
	} satisfies Task
}

export const makeCustomBindingsTask = (
	canisterConfigOrFn:
		| ((args: { ctx: TaskCtxShape }) => Promise<CustomCanisterConfig>)
		| ((args: { ctx: TaskCtxShape }) => CustomCanisterConfig)
		| CustomCanisterConfig,
) => {
	return {
		_tag: "task",
		id: Symbol("customCanister/bindings"),
		dependencies: {},
		provide: {},
		// TODO: do we allow a fn as args here?
		effect: Effect.gen(function* () {
			const canisterConfig = yield* resolveConfig(canisterConfigOrFn)
			const path = yield* Path.Path
			const fs = yield* FileSystem.FileSystem
			const appDir = yield* Config.string("APP_DIR")
			const { taskPath } = yield* TaskInfo
			const canisterName = taskPath.split(":").slice(0, -1).join(":")
			const didPath = canisterConfig.candid
			const wasmPath = canisterConfig.wasm
			yield* Effect.logDebug("Artifact paths", { wasmPath, didPath })

			yield* generateDIDJS(canisterName, didPath)
			yield* Effect.logDebug(`Generated DID JS for ${canisterName}`)
		}),
		description: "some description",
		tags: [Tags.CANISTER, Tags.CUSTOM, Tags.BINDINGS],
		computeCacheKey: Option.none(),
		input: Option.none(),
	} satisfies Task
}

export const makeInstallTask = <I, P extends Record<string, unknown>, _SERVICE>(
	installArgsFn?: (args: {
		ctx: TaskCtxShape
		mode: string
		deps: P
	}) => Promise<I> | I,
) => {
	return {
		_tag: "task",
		id: Symbol("customCanister/install"),
		dependencies: {},
		provide: {},
		computeCacheKey: Option.none(),
		input: Option.none(),
		effect: Effect.gen(function* () {
			yield* Effect.logDebug("Starting custom canister installation")
			const taskCtx = yield* TaskCtx
			const { dependencies } = yield* DependencyResults

			const { taskPath } = yield* TaskInfo
			const canisterName = taskPath.split(":").slice(0, -1).join(":")
			// TODO: this is a hack, we should have a better way to handle this
			const onlyCanisterName = canisterName.split(":").slice(-1)[0]
			const noEncodeArgs = onlyCanisterName === "NNSGenesisToken"
			yield* Effect.logDebug("No encode args", { noEncodeArgs, canisterName })
			//////////////////////////////////////////////////////////

			const canisterId = yield* loadCanisterId(taskPath)
			yield* Effect.logDebug("Loaded canister ID", { canisterId })

			const path = yield* Path.Path
			const fs = yield* FileSystem.FileSystem
			const appDir = yield* Config.string("APP_DIR")

			yield* canisterBuildGuard
			yield* Effect.logDebug("Build guard check passed")

			const didJSPath = path.join(
				appDir,
				iceDirName,
				"canisters",
				canisterName,
				`${canisterName}.did.js`,
			)
			// TODO: can we type it somehow?
			const canisterDID = yield* Effect.tryPromise({
				try: () => import(didJSPath),
				catch: Effect.fail,
			})
			yield* Effect.logDebug("Loaded canisterDID", { canisterDID })

			let installArgs = [] as unknown as I
			if (installArgsFn) {
				yield* Effect.logDebug("Executing install args function")

				const installFn = installArgsFn as (args: {
					ctx: TaskCtxShape
					mode: string
					deps: P
				}) => Promise<I> | I
				// TODO: should it catch errors?
				// TODO: handle different modes
				const installResult = installFn({
					mode: "install",
					ctx: taskCtx,
					deps: dependencies as P,
				})
				if (installResult instanceof Promise) {
					installArgs = yield* Effect.tryPromise({
						try: () => installResult,
						catch: (error) => {
							// TODO: proper error handling
							// console.error("Error executing install args function:", error)
							return error instanceof Error ? error : new Error(String(error))
						},
					})
				}
				// installArgs = yield* Effect.tryPromise({
				//   // TODO: pass everything
				//   try: () => fn({ ctx: finalCtx, mode: "install" }),
				//   catch: Effect.fail, // TODO: install args fail? proper error handling
				// })
				yield* Effect.logDebug("Install args generated", { args: installArgs })
			}

			yield* Effect.logDebug("Encoding args", { installArgs, canisterDID })
			const encodedArgs = noEncodeArgs
				? (installArgs as unknown as Uint8Array)
				: yield* Effect.try({
						// TODO: do we accept simple objects as well?
						// @ts-ignore
						try: () => encodeArgs(installArgs, canisterDID),
						catch: (error) => {
							throw new Error(
								`Failed to encode args: ${error instanceof Error ? error.message : String(error)}`,
							)
						},
					})
			yield* Effect.logDebug("Args encoded successfully")

      const isGzipped = yield* fs.exists(path.join(appDir, iceDirName, "canisters", canisterName, `${canisterName}.wasm.gz`))
			const wasmPath = path.join(
				appDir,
				iceDirName,
				"canisters",
				canisterName,
				isGzipped ? `${canisterName}.wasm.gz` : `${canisterName}.wasm`,
			)
			yield* installCanister({
				encodedArgs,
				canisterId,
				wasmPath,
			})
			yield* Effect.logDebug(`Canister ${canisterName} installed successfully`)
			const actor = yield* createActor<_SERVICE>({
				canisterId,
				canisterDID,
			})
			return {
				canisterId,
				canisterName,
				actor: instrumentActor(canisterName, actor),
			}
		}),
		description: "Install canister code",
		tags: [Tags.CANISTER, Tags.CUSTOM, Tags.INSTALL],
	} satisfies Task
}

const makeBuildTask = <P extends Record<string, unknown>>(
	canisterConfigOrFn:
		| ((args: { ctx: TaskCtxShape; deps: P }) => Promise<CustomCanisterConfig>)
		| ((args: { ctx: TaskCtxShape; deps: P }) => CustomCanisterConfig)
		| CustomCanisterConfig,
) => {
	return {
		_tag: "task",
		id: Symbol("customCanister/build"),
		dependencies: {},
		provide: {},
		effect: Effect.gen(function* () {
			const taskCtx = yield* TaskCtx
			const fs = yield* FileSystem.FileSystem
			const path = yield* Path.Path
			const appDir = yield* Config.string("APP_DIR")
			// TODO: could be a promise
			const canisterConfig = yield* resolveConfig(canisterConfigOrFn)
			const { taskPath } = yield* TaskInfo
			const canisterName = taskPath.split(":").slice(0, -1).join(":")
			const isGzipped = yield* fs.exists(path.join(appDir, iceDirName, "canisters", canisterName, `${canisterName}.wasm.gz`))
			const outWasmPath = path.join(
				appDir,
				iceDirName,
				"canisters",
				canisterName,
				isGzipped ? `${canisterName}.wasm.gz` : `${canisterName}.wasm`,
			)
			const wasm = yield* fs.readFile(canisterConfig.wasm)
			// Ensure the directory exists
			yield* fs.makeDirectory(path.dirname(outWasmPath), { recursive: true })
			yield* fs.writeFile(outWasmPath, wasm)

			const outCandidPath = path.join(
				appDir,
				iceDirName,
				"canisters",
				canisterName,
				`${canisterName}.did`,
			)
			const candid = yield* fs.readFile(canisterConfig.candid)
			yield* fs.writeFile(outCandidPath, candid)

			// if (fn) {
			//   yield* Effect.tryPromise({
			//     // TODO: why are we passing this in?
			//     try: () => fn(taskCtx),
			//     catch: Effect.fail,
			//   })
			// }
		}),
		description: "some description",
		tags: [Tags.CANISTER, Tags.CUSTOM, Tags.BUILD],
		computeCacheKey: Option.none(),
		input: Option.none(),
	} satisfies Task
}

export const resolveConfig = <T, P extends Record<string, unknown>>(
	configOrFn:
		| ((args: { ctx: TaskCtxShape; deps: P }) => Promise<T>)
		| ((args: { ctx: TaskCtxShape; deps: P }) => T)
		| T,
) =>
	Effect.gen(function* () {
		const taskCtx = yield* TaskCtx
		if (typeof configOrFn === "function") {
			const configFn = configOrFn as (args: {
				ctx: TaskCtxShape
			}) => Promise<T> | T
			const configResult = configFn({ ctx: taskCtx })
			if (configResult instanceof Promise) {
				return yield* Effect.tryPromise({
					try: () => configResult,
					catch: (error) => {
						// TODO: proper error handling
						console.error("Error resolving config function:", error)
						return error instanceof Error ? error : new Error(String(error))
					},
				})
			}
			return configResult
		}
		return configOrFn
	})

type CreateConfig = {
	canisterId?: string
}
export const makeCreateTask = <P extends Record<string, unknown>>(
	canisterConfigOrFn:
		| ((args: { ctx: TaskCtxShape; deps: P }) => Promise<CreateConfig>)
		| ((args: { ctx: TaskCtxShape; deps: P }) => CreateConfig)
		| CreateConfig,
	tags: string[] = [],
) => {
	const id = Symbol("canister/create")
	return {
		_tag: "task",
		id,
		dependencies: {},
		provide: {},
		effect: Effect.gen(function* () {
			const path = yield* Path.Path
			const fs = yield* FileSystem.FileSystem
			const taskCtx = yield* TaskCtx
			const canisterConfig = yield* resolveConfig(canisterConfigOrFn)
			const canisterId = yield* createCanister(canisterConfig?.canisterId)
			const canisterIdsService = yield* CanisterIdsService
			const appDir = yield* Config.string("APP_DIR")
			const { taskPath } = yield* TaskInfo
			const canisterName = taskPath.split(":").slice(0, -1).join(":")
			// TODO: network settings
			yield* canisterIdsService.setCanisterId({
				canisterName,
				network: "local",
				canisterId,
			})
			const outDir = path.join(appDir, iceDirName, "canisters", canisterName)
			yield* fs.makeDirectory(outDir, { recursive: true })
			return canisterId
		}),
		description: "some description",
		// TODO:
		tags: [Tags.CANISTER, Tags.CREATE, ...tags],
		computeCacheKey: Option.none(),
		input: Option.none(),
	} satisfies Task
}

const makeCustomCanisterBuilder = <
	I,
	S extends CanisterScope,
	D extends Record<string, Task>,
	P extends Record<string, Task>,
	Config extends CustomCanisterConfig,
	_SERVICE = unknown,
>(
	scope: S,
	// TODO: maybe we need to pass in the service type as well?
): CanisterBuilder<I, S, D, P, Config> => {
	return {
		create: (canisterConfigOrFn) => {
			const updatedScope = {
				...scope,
				children: {
					...scope.children,
					create: makeCreateTask<P>(canisterConfigOrFn, [Tags.CUSTOM]),
				},
			} satisfies CanisterScope
			return makeCustomCanisterBuilder<
				I,
				typeof updatedScope,
				D,
				P,
				Config,
				_SERVICE
			>(updatedScope)
		},
		installArgs: (installArgsFn) => {
			// TODO: is this a flag, arg, or what?
			const mode = "install"
			// TODO: passing in I makes the return type: any
			// TODO: we need to inject dependencies again! or they can be overwritten
			const dependencies = scope.children.install.dependencies
			const provide = scope.children.install.provide
			const installTask = makeInstallTask<
				I,
				ExtractTaskEffectSuccess<D> & ExtractTaskEffectSuccess<P>,
				_SERVICE
			>(installArgsFn)
			const updatedScope = {
				...scope,
				children: {
					...scope.children,
					install: {
						...installTask,
						dependencies,
						provide,
					},
				},
			} satisfies CanisterScope
			return makeCustomCanisterBuilder<
				I,
				typeof updatedScope,
				D,
				P,
				Config,
				_SERVICE
			>(updatedScope)
		},
		build: (canisterConfigOrFn) => {
			const updatedScope = {
				...scope,
				children: {
					...scope.children,
					build: makeBuildTask<P>(canisterConfigOrFn),
				},
			} satisfies CanisterScope
			return makeCustomCanisterBuilder<
				I,
				typeof updatedScope,
				D,
				P,
				Config,
				_SERVICE
			>(updatedScope)
		},
		// Here we extract the real tasks from the deps
		// is it enough to compare symbols?
		dependsOn: (dependencies) => {
			// TODO: check that its a canister builder
			// const dependencies = Object.fromEntries(
			//   Object.entries(deps).map(([key, dep]) => {
			//     // if (dep._tag === "builder") {
			//     //   return dep._scope.children.deploy
			//     // }
			//     // if (dep._tag === "scope") {
			//     //   return [key, dep.children.deploy]
			//     // }
			//     if (dep._tag === "task") {
			//       return [key, dep]
			//     }
			//     return [key, dep]
			//   }),
			// ) satisfies Record<string, Task> as MergeScopeDependencies<S, typeof deps>
			const finalDeps = Object.fromEntries(
				Object.entries(dependencies).map(([key, dep]) => {
					// if (dep._tag === "builder") {
					//   return dep._scope.children.deploy
					// }
					// if (dep._tag === "scope" && dep.children.deploy) {
					//   return [key, dep.children.deploy]
					// }
					if ("provides" in dep) {
						return [key, dep.provides]
					}
					return [key, dep satisfies Task]
				}),
			) satisfies Record<string, Task>

			const updatedScope = {
				...scope,
				children: {
					...scope.children,
					install: {
						...scope.children.install,
						dependencies: finalDeps,
					},
				},
			} satisfies CanisterScope as MergeScopeDependencies<
				S,
				ExtractProvidedDeps<typeof dependencies>
			>

			return makeCustomCanisterBuilder<
				I,
				typeof updatedScope,
				// TODO: update type?
				ExtractProvidedDeps<typeof dependencies>,
				P,
				Config
			>(updatedScope)
		},

		deps: (providedDeps) => {
			// TODO: do we transform here?
			// TODO: do we type check here?

			const finalDeps = Object.fromEntries(
				Object.entries(providedDeps).map(([key, dep]) => {
					// if (dep._tag === "builder") {
					//   return dep._scope.children.deploy
					// }
					// if (dep._tag === "scope" && dep.children.deploy) {
					//   return [key, dep.children.deploy]
					// }
					if ("provides" in dep) {
						return [key, dep.provides]
					}
					return [key, dep satisfies Task]
				}),
			) satisfies Record<string, Task>

			// TODO: do we need to pass in to create as well?
			const updatedScope = {
				...scope,
				children: {
					...scope.children,
					install: {
						...scope.children.install,
						provide: finalDeps,
					},
				},
			} satisfies CanisterScope as MergeScopeProvide<
				S,
				ExtractProvidedDeps<typeof providedDeps>
			>
			// return makeCustomCanisterBuilder<
			//   I,
			//   typeof updatedScope,
			//   D,
			//   // TODO: update type?
			//   typeof finalDeps,
			//   Config
			// >(updatedScope)
			return makeCustomCanisterBuilder<
				I,
				typeof updatedScope,
				D,
				// TODO: update type?
				ExtractProvidedDeps<typeof providedDeps>,
				Config
			>(updatedScope)
		},

		done: () => {
			return scope as unknown as UniformScopeCheck<S>
		},

		_tag: "builder",
	}
}

// TODO: some kind of metadata?
// TODO: warn about context if not provided
export const customCanister = <I = unknown, _SERVICE = unknown>(
	canisterConfigOrFn:
		| ((args: { ctx: TaskCtxShape }) => Promise<CustomCanisterConfig>)
		| ((args: { ctx: TaskCtxShape }) => CustomCanisterConfig)
		| CustomCanisterConfig,
) => {
	const initialScope = {
		_tag: "scope",
		tags: [Tags.CANISTER, Tags.CUSTOM],
		description: "some description",
		defaultTask: Option.some("deploy"),
		// TODO: default implementations
		children: {
			create: makeCreateTask(canisterConfigOrFn, [Tags.CUSTOM]),
			bindings: makeCustomBindingsTask(canisterConfigOrFn),

			// TODO: maybe just the return value of install? like a cleanup
			// delete: {
			//   task: deleteCanister(config),
			//   description: "some description",
			//   tags: [],
			//   ctx: ctx,
			// },
			build: makeBuildTask(canisterConfigOrFn),
			// install: makeInstallTask<I>(),
			install: makeInstallTask<I, Record<string, unknown>, _SERVICE>(),
			stop: makeStopTask(),
			delete: makeDeleteTask(),
		},
	} satisfies CanisterScope

	return makeCustomCanisterBuilder<
		I,
		typeof initialScope,
		Record<string, Task>,
		Record<string, Task>,
		CustomCanisterConfig,
		_SERVICE
	>(initialScope)
}

export const loadCanisterId = (taskPath: string) =>
	Effect.gen(function* () {
		const canisterName = taskPath.split(":").slice(0, -1).join(":")
		const canisterIdsService = yield* CanisterIdsService
		const canisterIds = yield* canisterIdsService.getCanisterIds()
		// TODO: dont hardcode local. add support for networks
		const canisterId = canisterIds[canisterName]?.local
		if (canisterId) {
			return canisterId as string
		}
		return yield* Effect.fail(new Error("Canister ID not found"))
	})

export const canisterBuildGuard = Effect.gen(function* () {
	const path = yield* Path.Path
	const fs = yield* FileSystem.FileSystem
	const appDir = yield* Config.string("APP_DIR")
	// TODO: dont wanna pass around id everywhere
	const { taskPath } = yield* TaskInfo
	const canisterName = taskPath.split(":").slice(0, -1).join(":")
	const didPath = path.join(
		appDir,
		iceDirName,
		"canisters",
		canisterName,
		`${canisterName}.did`,
	)
	const isGzipped = yield* fs.exists(path.join(appDir, iceDirName, "canisters", canisterName, `${canisterName}.wasm.gz`))
	const wasmPath = path.join(
		appDir,
		iceDirName,
		"canisters",
		canisterName,
		isGzipped ? `${canisterName}.wasm.gz` : `${canisterName}.wasm`,
	)
	const didExists = yield* fs.exists(didPath)
	if (!didExists) {
		yield* Effect.fail(
			new Error(
				`Candid file not found: ${didPath}, ${canisterName}, taskPath: ${taskPath}`,
			),
		)
	}
	const wasmExists = yield* fs
		.exists(wasmPath)
		.pipe(Effect.mapError((e) => new Error("Wasm file not found")))
	if (!wasmExists) {
		yield* Effect.fail(new Error("Wasm file not found"))
	}
	return true
})

type ICEConfig = ICEContext & {
	setup?: () => Promise<ICEContext>
}

// TODO: Do more here?
const scope = <T extends TaskTree>(description: string, children: T) => {
	return {
		_tag: "scope",
		tags: [],
		description,
		defaultTask: Option.none(),
		children,
	} satisfies Scope
}

const testTask = {
	_tag: "task",
	id: Symbol("test"),
	dependencies: {},
	provide: {},
	effect: Effect.gen(function* () {}),
	description: "",
	tags: [],
	computeCacheKey: Option.none(),
	input: Option.none(),
} satisfies Task

const testTask2 = {
	_tag: "task",
	id: Symbol("test"),
	dependencies: {},
	provide: {},
	effect: Effect.gen(function* () {}),
	description: "",
	tags: [],
	computeCacheKey: Option.none(),
	input: Option.none(),
} satisfies Task

const providedTask = {
	_tag: "task",
	id: Symbol("test"),
	effect: Effect.gen(function* () {}),
	description: "",
	tags: [],
	computeCacheKey: Option.none(),
	input: Option.none(),
	dependencies: {
		test: testTask,
	},
	provide: {
		test: testTask,
	},
} satisfies Task

const unProvidedTask = {
	_tag: "task",
	id: Symbol("test"),
	effect: Effect.gen(function* () {}),
	description: "",
	tags: [],
	computeCacheKey: Option.none(),
	input: Option.none(),
	dependencies: {
		test: testTask,
		test2: testTask,
	},
	provide: {
		test: testTask,
		// TODO: does not raise a warning?
		// test2: testTask2,
		// test2: testTask,
		// test3: testTask,
	},
} satisfies Task

const unProvidedTask2 = {
	_tag: "task",
	id: Symbol("test"),
	effect: Effect.gen(function* () {}),
	description: "",
	tags: [],
	computeCacheKey: Option.none(),
	input: Option.none(),
	dependencies: {
		test: testTask,
		// test2: testTask,
	},
	provide: {
		// test: testTask,
		// TODO: does not raise a warning?
		// test2: testTask2,
		// test2: testTask,
		// test3: testTask,
	},
} satisfies Task

const testScope = {
	_tag: "scope",
	tags: [Tags.CANISTER],
	description: "",
	defaultTask: Option.none(),
	children: {
		providedTask,
		unProvidedTask,
	},
} satisfies CanisterScope

const testScope2 = {
	_tag: "scope",
	tags: [Tags.CANISTER],
	description: "",
	defaultTask: Option.none(),
	children: {
		unProvidedTask2,
	},
} satisfies CanisterScope

const providedTestScope = {
	_tag: "scope",
	tags: [Tags.CANISTER],
	description: "",
	defaultTask: Option.none(),
	children: {
		providedTask,
	},
} satisfies CanisterScope

// Type checks
// const pt = providedTask satisfies DepBuilder<typeof providedTask>
// const upt = unProvidedTask satisfies DepBuilder<typeof unProvidedTask>
// const uts = testScope satisfies UniformScopeCheck<typeof testScope>
// const pts = providedTestScope satisfies UniformScopeCheck<
//   typeof providedTestScope
// >
// const uts2 = testScope2 satisfies UniformScopeCheck<typeof testScope2>

const test = customCanister(async () => ({
	wasm: "",
	candid: "",
}))

// // // test._scope.children.install.computeCacheKey = (task) => {
// // //   return task.id.toString()
// // // }

const t = test
	.dependsOn({
		asd: test.done().children.install,
	})
	.deps({
		asd: test.done().children.install,
		// TODO: extras also cause errors? should it be allowed?
		// asd2: test._scope.children.install,
	})
	// ._scope.children
	.installArgs(async ({ ctx, mode, deps }) => {
		// TODO: allow chaining builders with ice.customCanister()
		// to pass in context?
		// ctx.users.default
		// TODO: type the actors
		// ctx.dependencies.asd.actor
		deps.asd.actor
	})
	.done()
// t.children.install.computeCacheKey
// // t.children.install.dependencies

// type A = Effect.Effect.Success<typeof test._scope.children.install.effect>
