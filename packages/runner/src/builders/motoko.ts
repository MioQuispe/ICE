import { Effect, Record } from "effect"
import type { CachedTask, Task } from "../types/types.js"
// import mo from "motoko"
import { FileSystem, Path } from "@effect/platform"
// TODO: move to ./lib.ts
import { compileMotokoCanister, generateDIDJS } from "../canister.js"
import { ParamsToArgs, TaskCtx } from "../tasks/lib.js"
import { InstallModes } from "../services/replica.js"
import type {
	AllowedDep,
	CreateTask,
	DependencyMismatchError,
	ExtractScopeSuccesses,
	FileDigest,
	InstallTask,
	IsValid,
	NormalizeDeps,
	RemoveTask,
	StatusTask,
	StopTask,
	TaskCtxShape,
	ValidProvidedDeps,
} from "./lib.js"
import { getNodeByPath } from "../tasks/lib.js"
import { runTask } from "../tasks/run.js"
import {
	hashJson,
	isArtifactCached,
	linkChildren,
	makeCanisterStatusTask,
	makeCreateTask,
	makeInstallTask,
	makeRemoveTask,
	makeStopTask,
	normalizeDepsMap,
	resolveConfig,
	Tags,
	resolveMode,
	TaskError,
} from "./lib.js"
import { type } from "arktype"
import { deployParams } from "./custom.js"
import { ActorSubclass } from "../types/actor.js"

type MotokoCanisterConfig = {
	src: string
	canisterId?: string
}

export type MotokoCanisterScope<
	_SERVICE = any,
	I = any,
	D extends Record<string, Task> = Record<string, Task>,
	P extends Record<string, Task> = Record<string, Task>,
> = {
	_tag: "scope"
	id: symbol
	tags: Array<string | symbol>
	description: string
	defaultTask: "deploy"
	// only limited to tasks
	// children: Record<string, Task>
	children: {
		// create: Task<string>
		create: CreateTask
		bindings: MotokoBindingsTask
		build: MotokoBuildTask
		install: InstallTask<_SERVICE, I, D, P>
		// D,
		// P
		stop: StopTask
		remove: RemoveTask
		// TODO: same as install?
		deploy: MotokoDeployTask<_SERVICE>
		status: StatusTask
	}
}

export const motokoDeployParams = deployParams
// export const motokoDeployParams = {
// 	mode: {
// 		type: InstallModes,
// 		description: "The mode to install the canister in",
// 		default: "install",
// 		isFlag: true as const,
// 		isOptional: true as const,
// 		isVariadic: false as const,
// 		name: "mode",
// 		aliases: ["m"],
// 		parse: (value: string) => value as InstallModes,
// 	},
// 	args: {
// 		// TODO: maybe not Uint8Array?
// 		type: type("TypedArray.Uint8"),
// 		description: "The arguments to pass to the canister as a candid string",
// 		// default: undefined,
// 		isFlag: true as const,
// 		isOptional: true as const,
// 		isVariadic: false as const,
// 		name: "args",
// 		aliases: ["a"],
// 		parse: (value: string) => {
// 			// TODO: convert to candid string
// 			return new Uint8Array(Buffer.from(value))
// 		},
// 	},
// 	// TODO: provide defaults. just read from fs by canister name
// 	// should we allow passing in wasm bytes?
// 	wasm: {
// 		type: type("string"),
// 		description: "The path to the wasm file",
// 		isFlag: true as const,
// 		isOptional: true as const,
// 		isVariadic: false as const,
// 		name: "wasm",
// 		aliases: ["w"],
// 		parse: (value: string) => value as string,
// 	},
// 	// TODO: provide defaults
// 	candid: {
// 		// TODO: should be encoded?
// 		type: type("string"),
// 		description: "The path to the candid file",
// 		isFlag: true as const,
// 		isOptional: true as const,
// 		isVariadic: false as const,
// 		name: "candid",
// 		aliases: ["c"],
// 		parse: (value: string) => value as string,
// 	},
// 	// TODO: provide defaults
// 	canisterId: {
// 		type: type("string"),
// 		description: "The canister ID to install the canister in",
// 		isFlag: true as const,
// 		isOptional: true as const,
// 		isVariadic: false as const,
// 		name: "canisterId",
// 		aliases: ["i"],
// 		parse: (value: string) => value as string,
// 	},
// }

export type MotokoDeployTask<
	_SERVICE = unknown,
	D extends Record<string, Task> = {},
	P extends Record<string, Task> = {},
> = Omit<
	Task<
		{
			canisterId: string
			canisterName: string
			actor: ActorSubclass<_SERVICE>
			mode: InstallModes
		},
		D,
		P
	>,
	"params"
> & {
	params: typeof motokoDeployParams
}


export type MotokoDeployTaskArgs = ParamsToArgs<typeof motokoDeployParams>

export const makeMotokoDeployTask = <_SERVICE>(): MotokoDeployTask<_SERVICE> => {
	return {
		_tag: "task",
		// TODO: change
		id: Symbol("canister/deploy"),
		dependsOn: {},
		// TODO: we only want to warn at a type level?
		// TODO: type Task
		dependencies: {},
		namedParams: motokoDeployParams,
		params: motokoDeployParams,
		positionalParams: [],
		effect: Effect.gen(function* () {
			const { taskPath } = yield* TaskCtx
			const canisterName = taskPath.split(":").slice(0, -1).join(":")
			const parentScope = (yield* getNodeByPath(canisterName)) as MotokoCanisterScope<_SERVICE>
			const { args } = yield* TaskCtx
			const taskArgs = args as MotokoDeployTaskArgs
			const mode = yield* resolveMode()
			const [canisterId, { wasmPath, candidPath }] = yield* Effect.all(
				[
					Effect.gen(function* () {
						const taskPath = `${canisterName}:create`
						yield* Effect.logDebug("Now running create task")
						const { result: canisterId } = yield* runTask(
							parentScope.children.create,
						)
						yield* Effect.logDebug("Finished running create task")
						return canisterId
					}),
					Effect.gen(function* () {
						// Moc generates candid and wasm files in the same phase
						yield* Effect.logDebug("Now running build task")
						const {
							result: {
								wasmPath,
								candidPath,
							},
						} = yield* runTask(parentScope.children.build)
						yield* Effect.logDebug("Now running bindings task")
						yield* runTask(parentScope.children.bindings)
						return {
							wasmPath,
							candidPath,
						}
					}),
				],
				{
					concurrency: "unbounded",
				},
			)

			yield* Effect.logDebug("Now running install task")
			// TODO: no type error if params not provided at all
			const { result: installResult } = yield* runTask(parentScope.children.install, {
					mode,
					// TODO: currently does nothing. they are generated inside the installTask from the installArgsFn
					// args: taskArgs.args,
					canisterId,
					candid: candidPath,
					wasm: wasmPath,
			})

			yield* Effect.logDebug("Canister deployed successfully")
			return installResult
		}),
		description: "Deploy canister code",
		tags: [Tags.CANISTER, Tags.DEPLOY, Tags.MOTOKO],
	}
}

export type MotokoBindingsTask = CachedTask<
	{
		didJSPath: string
		didTSPath: string
	},
	{},
	{},
	{
		taskPath: string
		depCacheKeys: Record<string, string | undefined>
	}
>

const motokoBindingsParams = {
	// TODO:
	wasm: {
		type: "string",
		description: "Path to the wasm file",
	},
	candid: {
		type: "string",
		description: "Path to the candid file",
	},
}
export const makeMotokoBindingsTask = (): MotokoBindingsTask => {
	return {
		_tag: "task",
		id: Symbol("motokoCanister/bindings"),
		dependsOn: {},
		dependencies: {},
		namedParams: {},
		positionalParams: [],
		params: {},
		// TODO: do we allow a fn as args here?
		effect: Effect.gen(function* () {
			const path = yield* Path.Path
			const fs = yield* FileSystem.FileSystem
			const { taskPath, appDir, iceDir } = yield* TaskCtx
			const canisterName = taskPath.split(":").slice(0, -1).join(":")

			const isGzipped = yield* fs.exists(
				path.join(
					appDir,
					iceDir,
					"canisters",
					canisterName,
					`${canisterName}.wasm.gz`,
				),
			)
			const wasmPath = path.join(
				appDir,
				iceDir,
				"canisters",
				canisterName,
				isGzipped ? `${canisterName}.wasm.gz` : `${canisterName}.wasm`,
			)
			const didPath = path.join(
				appDir,
				iceDir,
				"canisters",
				canisterName,
				`${canisterName}.did`,
			)
			// TODO: convert to task params instead. the above can be the defaults
			// const wasmPath = taskArgs.wasm
			// const candidPath = taskArgs.candid

			yield* Effect.logDebug("Artifact paths", { wasmPath, didPath })

			const { didJS, didJSPath, didTSPath } = yield* generateDIDJS(
				canisterName,
				didPath,
			)
			yield* Effect.logDebug(`Generated DID JS for ${canisterName}`)
			return {
				didJSPath,
				didTSPath,
			}
		}),
		computeCacheKey: (input) => {
			return hashJson({
				depsHash: hashJson(input.depCacheKeys),
				taskPath: input.taskPath,
			})
		},
		input: () =>
			Effect.gen(function* () {
				const { taskPath, depResults } = yield* TaskCtx
				const depCacheKeys = Record.map(depResults, (dep) => dep.cacheKey)
				const input = {
					taskPath,
					depCacheKeys,
				}
				return input
			}),
		encode: (value) => Effect.succeed(JSON.stringify(value)),
		decode: (value) => Effect.succeed(JSON.parse(value as string)),
		encodingFormat: "string",
		description: "Generate bindings for Motoko canister",
		tags: [Tags.CANISTER, Tags.MOTOKO, Tags.BINDINGS],
	}
}

export type MotokoBuildTask = CachedTask<
	{
		wasmPath: string
		candidPath: string
	},
	{},
	{},
	{
		taskPath: string
		src: Array<FileDigest>
		depCacheKeys: Record<string, string | undefined>
	}
>

const makeMotokoBuildTask = <P extends Record<string, unknown>>(
	canisterConfigOrFn:
		| ((args: { ctx: TaskCtxShape; deps: P }) => Promise<MotokoCanisterConfig>)
		| ((args: { ctx: TaskCtxShape; deps: P }) => MotokoCanisterConfig)
		| MotokoCanisterConfig,
): MotokoBuildTask => {
	return {
		_tag: "task",
		id: Symbol("motokoCanister/build"),
		dependsOn: {},
		dependencies: {},
		effect: Effect.gen(function* () {
			yield* Effect.logDebug("Building Motoko canister")
			const path = yield* Path.Path
			const fs = yield* FileSystem.FileSystem
			const { appDir, iceDir, taskPath } = yield* TaskCtx
			const canisterConfig = yield* resolveConfig(canisterConfigOrFn)
			const canisterName = taskPath.split(":").slice(0, -1).join(":")
			const isGzipped = yield* fs.exists(
				path.join(
					appDir,
					iceDir,
					"canisters",
					canisterName,
					`${canisterName}.wasm.gz`,
				),
			)
			const wasmOutputFilePath = path.join(
				appDir,
				iceDir,
				"canisters",
				canisterName,
				isGzipped ? `${canisterName}.wasm.gz` : `${canisterName}.wasm`,
			)
			const outCandidPath = path.join(
				appDir,
				iceDir,
				"canisters",
				canisterName,
				`${canisterName}.did`,
			)
			// Ensure the directory exists
			yield* fs.makeDirectory(path.dirname(wasmOutputFilePath), {
				recursive: true,
			})
			yield* Effect.logDebug("Compiling Motoko canister")
			yield* compileMotokoCanister(
				path.resolve(appDir, canisterConfig.src),
				canisterName,
				wasmOutputFilePath,
			)
			yield* Effect.logDebug("Motoko canister built successfully", {
				wasmPath: wasmOutputFilePath,
				candidPath: outCandidPath,
			})
			return {
				wasmPath: wasmOutputFilePath,
				candidPath: outCandidPath,
			}
		}),
		computeCacheKey: (input) => {
			// TODO: pocket-ic could be restarted?
			const installInput = {
				taskPath: input.taskPath,
				depsHash: hashJson(input.depCacheKeys),
				// TODO: should we hash all fields though?
				srcHash: hashJson(input.src.map((s) => s.sha256)),
			}
			const cacheKey = hashJson(installInput)
			return cacheKey
		},
		input: () =>
			Effect.gen(function* () {
				const { taskPath, depResults } = yield* TaskCtx
				const dependencies = depResults
				const depCacheKeys = Record.map(dependencies, (dep) => dep.cacheKey)
				const canisterConfig = yield* resolveConfig(canisterConfigOrFn)
				const path = yield* Path.Path
				const fs = yield* FileSystem.FileSystem
				const srcDir = path.dirname(canisterConfig.src)
				const entries = yield* fs.readDirectory(srcDir, {
					recursive: true,
				})
				const srcFiles = entries.filter((entry) => entry.endsWith(".mo"))
				const prevSrcDigests: Array<FileDigest> = []
				const srcDigests: Array<FileDigest> = []
				for (const [index, file] of srcFiles.entries()) {
					const prevSrcDigest = prevSrcDigests?.[index]
					const filePath = path.join(srcDir, file)
					const { fresh: srcFresh, digest: srcDigest } =
						yield* Effect.tryPromise({
							try: () => isArtifactCached(filePath, prevSrcDigest),
							catch: (e) =>
								new TaskError({
									message: "Failed to check if artifact is cached",
								}),
						})
					srcDigests.push(srcDigest)
				}
				const input = {
					taskPath,
					src: srcDigests,
					depCacheKeys,
				}
				return input
			}),
		encode: (value) => Effect.succeed(JSON.stringify(value)),
		decode: (value) => Effect.succeed(JSON.parse(value as string)),
		encodingFormat: "string",
		description: "Build Motoko canister",
		tags: [Tags.CANISTER, Tags.MOTOKO, Tags.BUILD],
		namedParams: {},
		positionalParams: [],
		params: {},
	}
}

export class MotokoCanisterBuilder<
	I extends unknown[],
	S extends MotokoCanisterScope<_SERVICE, I, D, P>,
	D extends Record<string, Task>,
	P extends Record<string, Task>,
	Config extends MotokoCanisterConfig,
	_SERVICE = unknown,
> {
	#scope: S
	constructor(scope: S) {
		this.#scope = scope
	}
	create(
		canisterConfigOrFn:
			| Config
			| ((args: { ctx: TaskCtxShape; deps: P }) => Config)
			| ((args: { ctx: TaskCtxShape; deps: P }) => Promise<Config>),
	): MotokoCanisterBuilder<
		I,
		MotokoCanisterScope<_SERVICE, I, D, P>,
		D,
		P,
		Config,
		_SERVICE
	> {
		const updatedScope = {
			...this.#scope,
			children: {
				...this.#scope.children,
				create: makeCreateTask<P>(canisterConfigOrFn, [Tags.MOTOKO]),
			},
		} satisfies MotokoCanisterScope<_SERVICE, I, D, P>
		return new MotokoCanisterBuilder(updatedScope)
	}

	build(
		canisterConfigOrFn:
			| Config
			| ((args: { ctx: TaskCtxShape; deps: P }) => Config)
			| ((args: { ctx: TaskCtxShape; deps: P }) => Promise<Config>),
	): MotokoCanisterBuilder<
		I,
		MotokoCanisterScope<_SERVICE, I, D, P>,
		D,
		P,
		Config,
		_SERVICE
	> {
		const updatedScope = {
			...this.#scope,
			children: {
				...this.#scope.children,
				build: makeMotokoBuildTask<P>(canisterConfigOrFn),
			},
		} satisfies MotokoCanisterScope<_SERVICE, I, D, P>
		return new MotokoCanisterBuilder(updatedScope)
	}

	installArgs(
		installArgsFn: (args: {
			ctx: TaskCtxShape
			deps: ExtractScopeSuccesses<D> & ExtractScopeSuccesses<P>
			mode: string
		}) => I | Promise<I>,
		{
			customEncode,
		}: {
			customEncode:
				| undefined
				| ((args: I) => Promise<Uint8Array<ArrayBufferLike>>)
		} = {
			customEncode: undefined,
		},
	): MotokoCanisterBuilder<
		I,
		MotokoCanisterScope<_SERVICE, I, D, P>,
		D,
		P,
		Config,
		_SERVICE
	> {
		// TODO: is this a flag, arg, or what?
		const mode = "install"
		// TODO: passing in I makes the return type: any
		// TODO: we need to inject dependencies again! or they can be overwritten
		const dependsOn = this.#scope.children.install.dependsOn
		const dependencies = this.#scope.children.install.dependencies
		const installTask = {
			...makeInstallTask<
				I,
				// TODO: add bindings and create to the type?
				D,
				P,
				_SERVICE
			>(installArgsFn, { customEncode }),
			dependsOn,
			dependencies: {
				...dependencies,
				bindings: this.#scope.children.bindings,
				create: this.#scope.children.create,
			},
		}
		const updatedScope = {
			...this.#scope,
			children: {
				...this.#scope.children,
				install: installTask,
			},
		} satisfies MotokoCanisterScope<_SERVICE, I, D, P>

		return new MotokoCanisterBuilder(updatedScope)
	}

	deps<UP extends Record<string, AllowedDep>, NP extends NormalizeDeps<UP>>(
		providedDeps: ValidProvidedDeps<D, UP>,
	): MotokoCanisterBuilder<
		I,
		MotokoCanisterScope<_SERVICE, I, D, NP>,
		D,
		NP,
		Config,
		_SERVICE
	> {
		const finalDeps = normalizeDepsMap(providedDeps) as NP

		const installTask = {
			...this.#scope.children.install,
			dependencies: finalDeps,
		} as InstallTask<_SERVICE, I, D, NP>

		const updatedChildren = {
			...this.#scope.children,
			install: installTask,
		}

		const updatedScope = {
			...this.#scope,
			children: updatedChildren,
		} satisfies MotokoCanisterScope<_SERVICE, I, D, NP>
		return new MotokoCanisterBuilder(updatedScope)
	}

	dependsOn<
		UD extends Record<string, AllowedDep>,
		ND extends NormalizeDeps<UD>,
	>(
		dependencies: UD,
	): MotokoCanisterBuilder<
		I,
		MotokoCanisterScope<_SERVICE, I, ND, P>,
		ND,
		P,
		Config,
		_SERVICE
	> {
		const updatedDependsOn = normalizeDepsMap(dependencies) as ND
		const installTask = {
			...this.#scope.children.install,
			dependsOn: updatedDependsOn,
		} as InstallTask<_SERVICE, I, ND, P>
		const updatedChildren = {
			...this.#scope.children,
			install: installTask,
		}

		const updatedScope = {
			...this.#scope,
			children: updatedChildren,
		} satisfies MotokoCanisterScope<_SERVICE, I, ND, P>
		return new MotokoCanisterBuilder(updatedScope)
	}

	make(
		this: IsValid<S> extends true
			? MotokoCanisterBuilder<I, S, D, P, Config, _SERVICE>
			: DependencyMismatchError<S>,
	): S {
		// // Otherwise we get a type error
		const self = this as MotokoCanisterBuilder<I, S, D, P, Config, _SERVICE>

		// TODO: can we do this in a type-safe way?
		// so we get warnings about stale dependencies?
		const linkedChildren = linkChildren(self.#scope.children)

		const finalScope = {
			...self.#scope,
			id: Symbol("scope"),
			children: linkedChildren,
		} satisfies MotokoCanisterScope<_SERVICE, I, D, P>
		return finalScope
	}
}

export const motokoCanister = <
	_SERVICE = unknown,
	I extends unknown[] = unknown[],
	P extends Record<string, unknown> = Record<string, unknown>,
>(
	canisterConfigOrFn:
		| MotokoCanisterConfig
		| ((args: { ctx: TaskCtxShape; deps: P }) => MotokoCanisterConfig)
		| ((args: { ctx: TaskCtxShape; deps: P }) => Promise<MotokoCanisterConfig>),
) => {
	const initialScope = {
		_tag: "scope",
		id: Symbol("scope"),
		tags: [Tags.CANISTER, Tags.MOTOKO],
		description: "Motoko canister scope",
		defaultTask: "deploy",
		children: {
			create: makeCreateTask(canisterConfigOrFn, [Tags.MOTOKO]),
			build: makeMotokoBuildTask(canisterConfigOrFn),
			bindings: makeMotokoBindingsTask(),
			stop: makeStopTask(),
			remove: makeRemoveTask(),
			install: makeInstallTask<I, {}, {}, _SERVICE>(),
			deploy: makeMotokoDeployTask<_SERVICE>(),
			status: makeCanisterStatusTask([Tags.MOTOKO]),
		},
	} satisfies MotokoCanisterScope<_SERVICE, I, {}, {}>

	return new MotokoCanisterBuilder<
		I,
		MotokoCanisterScope<_SERVICE, I, {}, {}>,
		{},
		{},
		MotokoCanisterConfig,
		_SERVICE
	>(initialScope)
}

const testTask = {
	_tag: "task",
	id: Symbol("test"),
	dependsOn: {},
	dependencies: {},
	effect: Effect.gen(function* () {}),
	description: "",
	tags: [],
	namedParams: {},
	positionalParams: [],
	params: {},
} satisfies Task

const testTask2 = {
	_tag: "task",
	id: Symbol("test"),
	dependsOn: {},
	dependencies: {},
	effect: Effect.gen(function* () {}),
	description: "",
	tags: [],
	namedParams: {},
	positionalParams: [],
	params: {},
} satisfies Task

const providedTask = {
	_tag: "task",
	id: Symbol("test"),
	effect: Effect.gen(function* () {
		return "some value"
	}),
	description: "",
	tags: [],
	dependsOn: {
		test: testTask,
	},
	dependencies: {
		test: testTask,
	},
	namedParams: {},
	positionalParams: [],
	params: {},
} satisfies Task

const unProvidedTask = {
	_tag: "task",
	id: Symbol("test"),
	effect: Effect.gen(function* () {}),
	description: "",
	tags: [],
	dependsOn: {
		test: testTask,
		test2: testTask,
	},
	dependencies: {
		test: testTask,
		// TODO: does not raise a warning?
		// test2: testTask2,
		// test2: testTask,
		// test3: testTask,
	},
	namedParams: {},
	positionalParams: [],
	params: {},
} satisfies Task

const unProvidedTask2 = {
	_tag: "task",
	id: Symbol("test"),
	effect: Effect.gen(function* () {}),
	description: "",
	tags: [],
	dependsOn: {
		test: testTask,
		// test2: testTask,
	},
	dependencies: {
		// test: testTask,
		// TODO: does not raise a warning?
		// test2: testTask2,
		// test2: testTask,
		// test3: testTask,
	},
	namedParams: {},
	positionalParams: [],
	params: {},
} satisfies Task

const testScope = {
	_tag: "scope",
	tags: [Tags.CANISTER],
	id: Symbol("scope"),
	description: "",
	children: {
		providedTask,
		unProvidedTask,
	},
}

const testScope2 = {
	_tag: "scope",
	id: Symbol("scope"),
	tags: [Tags.CANISTER],
	description: "",
	children: {
		unProvidedTask2,
	},
}

const providedTestScope = {
	_tag: "scope",
	id: Symbol("scope"),
	tags: [Tags.CANISTER],
	description: "",
	children: {
		providedTask,
	},
}

// Type checks
// const pt = providedTask satisfies DepBuilder<typeof providedTask>
// const upt = unProvidedTask satisfies DepBuilder<typeof unProvidedTask>
// const uts = testScope satisfies UniformScopeCheck<typeof testScope>
// const pts = providedTestScope satisfies UniformScopeCheck<
//   typeof providedTestScope
// >
// const uts2 = testScope2 satisfies UniformScopeCheck<typeof testScope2>

// const test = customCanister(async () => ({
//   wasm: "",
//   candid: "",
// }))

// // test._scope.children.install.computeCacheKey = (task) => {
// //   return task.id.toString()
// // }

// const t = test.deps({ asd: test._scope.children.create }).provide({
//   asd: test._scope.children.create,
//   // TODO: extras also cause errors? should it be allowed?
//   // asd2: test._scope.children.create,
// }).make()
// t.children.install.computeCacheKey
// // t.children.install.dependencies

// const testMotokoCanister = motokoCanister(async () => ({ src: "src/motoko/canister.mo" }))
// .dependsOn({
//   providedTask: providedTask,
// })
// .deps({
//   providedTask2: providedTask,
// })
// .installArgs(async ({ ctx, mode, deps }) => {
//   deps.providedTask
// })
// .make()
