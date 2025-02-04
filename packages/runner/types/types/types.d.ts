import type { Effect } from "effect";
import type { ActorSubclass, Agent, Identity } from "@dfinity/agent";
import type { Principal } from "@dfinity/principal";
export type CanisterActor = {
    actor: ActorSubclass<unknown>;
    canisterId: string;
    getControllers: () => Promise<void>;
    addControllers: (controllers: string[]) => Promise<void>;
    setControllers: (controllers: string[]) => Promise<void>;
};
export type ManagementActor = import("@dfinity/agent").ActorSubclass<import("../canisters/management_new/management.types.js")._SERVICE>;
export type CrystalContext = {
    users: {
        [key: string]: {
            identity: Identity;
            principal: Principal;
            accountId: string;
            agent: Agent;
        };
    };
    networks: {
        [key: string]: {
            agent: Agent;
            identity: Identity;
        };
    };
};
export interface Task<A = unknown, E = unknown, R = unknown, I = unknown> {
    _tag: "task";
    readonly id: symbol;
    effect: Effect.Effect<A, E, R>;
    description: string;
    tags: Array<string | symbol>;
    dependencies: Array<Task>;
    input?: I;
    computeCacheKey?: (task: Task<A, E, R, I>) => string;
}
export type Scope = {
    _tag: "scope";
    tags: Array<string | symbol>;
    description: string;
    children: Record<string, TaskTreeNode>;
};
export type BuilderResult = {
    _tag: "builder";
    _scope: Scope;
    [key: string]: any;
};
export type TaskTreeNode = Task | Scope | BuilderResult;
export type TaskTree = Record<string, TaskTreeNode>;
export type CrystalConfig = CrystalContext;
export type CrystalConfigFile = {
    default: CrystalContext;
} & {
    [key: string]: TaskTreeNode;
};
