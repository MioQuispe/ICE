import type {
  BuilderResult,
  Task,
  CanisterConstructor,
} from "../types/types.js"
import type { TaskCtxShape } from "../index.js"
// import type { Effect } from "effect"
import { Effect, Option } from "effect"
import { customCanister } from "./custom.js"

export type ExtractProvidedDeps<
  NP extends Record<string, Task | CanisterConstructor>,
> = {
  [K in keyof NP]: NP[K] extends CanisterConstructor
    ? NP[K]["provides"]
    : NP[K] extends Task
      ? NP[K]
      : never
}

export type CompareTaskReturnValues<T extends Task> = T extends {
  effect: Effect.Effect<infer S, any, any>
}
  ? S
  : never

type DependenciesOf<T> = T extends { dependencies: infer D } ? D : never
type ProvideOf<T> = T extends { provide: infer P } ? P : never

type DependencyReturnValues<T> =
  DependenciesOf<T> extends Record<string, Task>
    ? {
        [K in keyof DependenciesOf<T>]: CompareTaskReturnValues<
          DependenciesOf<T>[K]
        >
      }
    : never

type ProvideReturnValues<T> =
  ProvideOf<T> extends Record<string, Task>
    ? { [K in keyof ProvideOf<T>]: CompareTaskReturnValues<ProvideOf<T>[K]> }
    : never

// // Compare return value of task
export type DepBuilder<T> =
  DependencyReturnValues<T> extends ProvideReturnValues<T>
    ? ProvideReturnValues<T> extends DependencyReturnValues<T>
      ? T
      : never
    : never

// export type DepBuilder<T> =
//   DependenciesOf<T> extends ProvideOf<T>
//     ? ProvideOf<T> extends DependenciesOf<T>
//       ? T
//       : never
//     : never

export type UniformScopeCheck<S extends CanisterScope> = S extends {
  children: infer C
}
  ? C extends { [K in keyof C]: DepBuilder<C[K]> }
    ? S
    : DependencyMismatchError<S>
  : DependencyMismatchError<S>

type MergeTaskDeps<T extends Task, ND extends Record<string, Task>> = {
  [K in keyof T]: K extends "dependencies" ? T[K] & ND : T[K]
}

type MergeTaskProvide<T extends Task, NP extends Record<string, Task>> = {
  [K in keyof T]: K extends "provide" ? T[K] & NP : T[K]
}

/**
 * Update every task in the children record by merging in ND.
 */
type MergeAllChildrenDeps<
  C extends Record<string, Task>,
  ND extends Record<string, Task>,
> = {
  [K in keyof C]: MergeTaskDeps<C[K], ND>
}

type MergeAllChildrenProvide<
  C extends Record<string, Task>,
  NP extends Record<string, Task>,
> = {
  [K in keyof C]: MergeTaskProvide<C[K], NP>
}
/**
 * Merge new dependencies ND into the entire scope S by updating its children.
 */
export type MergeScopeDependencies<
  S extends CanisterScope,
  ND extends Record<string, Task>,
> = Omit<S, "children"> & {
  children: MergeAllChildrenDeps<S["children"], ND>
}

export type MergeScopeProvide<
  S extends CanisterScope,
  NP extends Record<string, Task>,
> = Omit<S, "children"> & {
  children: MergeAllChildrenProvide<S["children"], NP>
}

/**
 * Extracts the success type of the Effect from each Task in a Record<string, Task>.
 *
 * @template T - A record of tasks.
 */
export type ExtractTaskEffectSuccess<T extends Record<string, Task>> = {
  [K in keyof T]: Effect.Effect.Success<T[K]["effect"]>
}

/**
 * @doc
 * [ERROR] Missing required dependencies:
 * Please call .setDependencies() with all required keys before finalizing the builder.
 */
export type DependencyMismatchError<S extends CanisterScope> = {
  // This property key is your custom error message.
  "[CRYSTAL-ERROR: Dependency mismatch. Please provide all required dependencies.]": true
}

// Compute a boolean flag from our check.
export type IsValid<S extends CanisterScope> =
  UniformScopeCheck<S> extends DependencyMismatchError<S> ? false : true

export type CanisterScope = {
  _tag: "scope"
  tags: Array<string | symbol>
  description: string
  // only limited to tasks
  children: Record<string, Task>
}

export interface CanisterBuilder<
  I,
  S extends CanisterScope,
  D extends Record<string, Task>,
  P extends Record<string, Task>,
  Config,
> {
  create: (
    canisterConfigOrFn:
      | Config
      | ((ctx: TaskCtxShape) => Config)
      | ((ctx: TaskCtxShape) => Promise<Config>),
  ) => CanisterBuilder<I, S, D, P, Config>
  // install: (
  //   installArgsOrFn:
  //     | ((args: { ctx: TaskCtxShape<P>; mode: string }) => Promise<I>)
  //     | ((args: { ctx: TaskCtxShape<P>; mode: string }) => I)
  //     // | I,
  // ) => CanisterBuilder<I, S, D, P, Config>

  // TODO: due to TS limitations we cannot overload the install method with an object signature
  // the type inference will fail and the type becomes any
  // Overload signatures for install:

  // install(installArgsOrFn: I): CanisterBuilder<I, S, D, P, Config>

  // only allow functions for now
  install(
    installArgsFn: (args: {
      ctx: TaskCtxShape<ExtractTaskEffectSuccess<D>>
      mode: string
    }) => I | Promise<I>,
  ): CanisterBuilder<I, S, D, P, Config>

  build: (
    canisterConfigOrFn:
      | Config
      | ((ctx: TaskCtxShape) => Config)
      | ((ctx: TaskCtxShape) => Promise<Config>),
  ) => CanisterBuilder<I, S, D, P, Config>
  // TODO: allow passing in a CanisterScope and extract from it
  deps: <ND extends Record<string, Task | CanisterConstructor>>(
    deps: ND,
  ) => CanisterBuilder<
  I, 
  MergeScopeDependencies<S, ExtractProvidedDeps<ND>>, 
  ExtractProvidedDeps<ND>, 
  P, 
  Config
  >
  provide: <NP extends Record<string, Task | CanisterConstructor>>(
    providedDeps: NP,
  ) => CanisterBuilder<
    I,
    MergeScopeProvide<S, ExtractProvidedDeps<NP>>,
    D,
    ExtractProvidedDeps<NP>,
    Config
  >
  // done: () => UniformScopeCheck<S extends CanisterScope ? S : never>
  // done: () => S
  /**
   * Finalizes the builder state.
   *
   * This method is only callable if the builder is in a valid state. If not,
   * the builder does not have the required dependency fields and this method
   * will produce a compile-time error with a descriptive message.
   *
   * @returns The finalized builder state if valid.
   */
  done(
    this: IsValid<S> extends true
      ? CanisterBuilder<I, S, D, P, Config>
      : DependencyMismatchError<S>,
  ): UniformScopeCheck<S>

  // TODO:
  //   bindings: (fn: (args: { ctx: TaskCtxShape }) => Promise<I>) => CanisterBuilder<I>
  // Internal property to store the current scope
  _scope: S
  _tag: "builder"
}

export const Tags = {
  CANISTER: "$$crystal/canister",
  CREATE: "$$crystal/create",
  BUILD: "$$crystal/build",
  INSTALL: "$$crystal/install",
  BINDINGS: "$$crystal/bindings",
  DEPLOY: "$$crystal/deploy",
  DELETE: "$$crystal/delete",
  UI: "$$crystal/ui",
  // TODO: hmm do we need this?
  SCRIPT: "$$crystal/script",
}

const testTask = {
  _tag: "task",
  id: Symbol("test"),
  dependencies: {},
  provide: {},
  effect: Effect.gen(function* () {
    return { testTask: "test" }
  }),
  description: "",
  tags: [],
  computeCacheKey: Option.none(),
} satisfies Task

const testTask2 = {
  _tag: "task",
  id: Symbol("test"),
  dependencies: {},
  provide: {},
  effect: Effect.gen(function* () {
    return { testTask2: "test" }
  }),
  description: "",
  tags: [],
  computeCacheKey: Option.none(),
} satisfies Task

const providedTask = {
  _tag: "task",
  id: Symbol("test"),
  effect: Effect.gen(function* () {}),
  description: "",
  tags: [],
  computeCacheKey: Option.none(),
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
  children: {
    providedTask,
    unProvidedTask,
  },
} satisfies CanisterScope

const testScope2 = {
  _tag: "scope",
  tags: [Tags.CANISTER],
  description: "",
  children: {
    unProvidedTask2,
  },
} satisfies CanisterScope

const providedTestScope = {
  _tag: "scope",
  tags: [Tags.CANISTER],
  description: "",
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

// const Canister = {
//   provides: testTask2
// } satisfies CanisterConstructor

// const providedMap = {
//   Canister,
//   testTask2,
// } satisfies Record<string, Task | CanisterConstructor>

// const debugType = {} as ExtractProvidedDeps<typeof providedMap>

// debugType.Canister
// debugType.testTask2

// const test = customCanister(async () => ({
//   wasm: "",
//   candid: "",
// }))

// // // // test._scope.children.install.computeCacheKey = (task) => {
// // // //   return task.id.toString()
// // // // }

// const t = test
//   .deps({
//     Canister: Canister.provides,
//     testTask: testTask,
//   })
//   .provide({
//     // asd: testTask
//     // TODO: extras also cause errors? should it be allowed?
//     // asd: testTask2,
//     Canister: Canister.provides,
//     testTask: testTask,
//   })
//   // ._scope.children
//   .install(async ({ ctx, mode }) => {
//     // TODO: allow chaining builders with crystal.customCanister()
//     // to pass in context?
//     // ctx.users.default
//     // TODO: type the actors
//     ctx.dependencies.Canister
//     ctx.dependencies.testTask
//   })
//   .done()

// // t.children.install.effect

// // const debugType = {} as CompareTaskReturnValues<typeof t.children.install>
