import type { Agent, HttpDetailsResponse, QueryResponseRejected, SubmitResponse } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';
import type { Principal } from '@dfinity/principal';

declare type VerifyFunc = (pk: Uint8Array, sig: Uint8Array, msg: Uint8Array) => Promise<boolean>;

export declare type RequestId = ArrayBuffer & {
    __requestId__: void;
};

export interface CreateCertificateOptions {
    /**
     * The bytes encoding the certificate to be verified
     */
    certificate: ArrayBuffer;
    /**
     * The root key against which to verify the certificate
     * (normally, the root key of the IC main network)
     */
    rootKey: ArrayBuffer;
    /**
     * The effective canister ID of the request when verifying a response, or
     * the signing canister ID when verifying a certified variable.
     */
    canisterId: Principal;
    /**
     * BLS Verification strategy. Default strategy uses wasm for performance, but that may not be available in all contexts.
     */
    blsVerify?: VerifyFunc;
    /**
     * The maximum age of the certificate in minutes. Default is 5 minutes.
     * @default 5
     * This is used to verify the time the certificate was signed, particularly for validating Delegation certificates, which can live for longer than the default window of +/- 5 minutes. If the certificate is
     * older than the specified age, it will fail verification.
     */
    maxAgeInMinutes?: number;
}
export declare enum RequestStatusResponseStatus {
    Received = "received",
    Processing = "processing",
    Replied = "replied",
    Rejected = "rejected",
    Unknown = "unknown",
    Done = "done"
}
export declare type PollStrategy = (canisterId: Principal, requestId: RequestId, status: RequestStatusResponseStatus) => Promise<void>;
export declare type PollStrategyFactory = () => PollStrategy;
/**
 * An error that happens in the Agent. This is the root of all errors and should be used
 * everywhere in the Agent code (this package).
 *
 * @todo https://github.com/dfinity/agent-js/issues/420
 */
export declare class AgentError extends Error {
    readonly message: string;
    constructor(message: string);
}

export declare type ActorConstructor = new (config: ActorConfig) => ActorSubclass;
export declare class ActorCallError extends AgentError {
    readonly canisterId: Principal;
    readonly methodName: string;
    readonly type: 'query' | 'update';
    readonly props: Record<string, string>;
    constructor(canisterId: Principal, methodName: string, type: 'query' | 'update', props: Record<string, string>);
}
export declare class QueryCallRejectedError extends ActorCallError {
    readonly result: QueryResponseRejected;
    constructor(canisterId: Principal, methodName: string, result: QueryResponseRejected);
}
export declare class UpdateCallRejectedError extends ActorCallError {
    readonly requestId: RequestId;
    readonly response: SubmitResponse['response'];
    constructor(canisterId: Principal, methodName: string, requestId: RequestId, response: SubmitResponse['response']);
}
/**
 * Configuration to make calls to the Replica.
 */
export interface CallConfig {
    /**
     * An agent to use in this call, otherwise the actor or call will try to discover the
     * agent to use.
     */
    agent?: Agent;
    /**
     * A polling strategy factory that dictates how much and often we should poll the
     * read_state endpoint to get the result of an update call.
     */
    pollingStrategyFactory?: PollStrategyFactory;
    /**
     * The canister ID of this Actor.
     */
    canisterId?: string | Principal;
    /**
     * The effective canister ID. This should almost always be ignored.
     */
    effectiveCanisterId?: Principal;
}
/**
 * Configuration that can be passed to customize the Actor behaviour.
 */
export interface ActorConfig extends CallConfig {
    /**
     * The Canister ID of this Actor. This is required for an Actor.
     */
    canisterId: string | Principal;
    /**
     * An override function for update calls' CallConfig. This will be called on every calls.
     */
    callTransform?(methodName: string, args: unknown[], callConfig: CallConfig): Partial<CallConfig> | void;
    /**
     * An override function for query calls' CallConfig. This will be called on every query.
     */
    queryTransform?(methodName: string, args: unknown[], callConfig: CallConfig): Partial<CallConfig> | void;
    /**
     * Polyfill for BLS Certificate verification in case wasm is not supported
     */
    blsVerify?: CreateCertificateOptions['blsVerify'];
}
/**
 * A subclass of an actor. Actor class itself is meant to be a based class.
 */
export declare type ActorSubclass<T = Record<string, ActorMethod>> = Actor & T;
/**
 * An actor method type, defined for each methods of the actor service.
 */
export interface ActorMethod<Args extends unknown[] = unknown[], Ret = unknown> {
    (...args: Args): Promise<Ret>;
    withOptions(options: CallConfig): (...args: Args) => Promise<Ret>;
}
/**
 * An actor method type, defined for each methods of the actor service.
 */
export interface ActorMethodWithHttpDetails<Args extends unknown[] = unknown[], Ret = unknown> extends ActorMethod {
    (...args: Args): Promise<{
        httpDetails: HttpDetailsResponse;
        result: Ret;
    }>;
}
export declare type FunctionWithArgsAndReturn<Args extends unknown[] = unknown[], Ret = unknown> = (...args: Args) => Ret;
export declare type ActorMethodMappedWithHttpDetails<T> = {
    [K in keyof T]: T[K] extends FunctionWithArgsAndReturn<infer Args, infer Ret> ? ActorMethodWithHttpDetails<Args, Ret> : never;
};
/**
 * The mode used when installing a canister.
 */
export declare enum CanisterInstallMode {
    Install = "install",
    Reinstall = "reinstall",
    Upgrade = "upgrade"
}
/**
 * Internal metadata for actors. It's an enhanced version of ActorConfig with
 * some fields marked as required (as they are defaulted) and canisterId as
 * a Principal type.
 */
interface ActorMetadata {
    service: IDL.ServiceClass;
    agent?: Agent;
    config: ActorConfig;
}
declare const metadataSymbol: unique symbol;
export interface CreateActorClassOpts {
    httpDetails?: boolean;
}
/**
 * An actor base class. An actor is an object containing only functions that will
 * return a promise. These functions are derived from the IDL definition.
 */
export declare class Actor {
    /**
     * Get the Agent class this Actor would call, or undefined if the Actor would use
     * the default agent (global.ic.agent).
     * @param actor The actor to get the agent of.
     */
    static agentOf(actor: Actor): Agent | undefined;
    /**
     * Get the interface of an actor, in the form of an instance of a Service.
     * @param actor The actor to get the interface of.
     */
    static interfaceOf(actor: Actor): IDL.ServiceClass;
    static canisterIdOf(actor: Actor): Principal;
    static install(fields: {
        module: ArrayBuffer;
        mode?: CanisterInstallMode;
        arg?: ArrayBuffer;
    }, config: ActorConfig): Promise<void>;
    static createCanister(config?: CallConfig): Promise<Principal>;
    static createAndInstallCanister(interfaceFactory: IDL.InterfaceFactory, fields: {
        module: ArrayBuffer;
        arg?: ArrayBuffer;
    }, config?: CallConfig): Promise<ActorSubclass>;
    static createActorClass(interfaceFactory: IDL.InterfaceFactory, options?: CreateActorClassOpts): ActorConstructor;
    static createActor<T = Record<string, ActorMethod>>(interfaceFactory: IDL.InterfaceFactory, configuration: ActorConfig): ActorSubclass<T>;
    static createActorWithHttpDetails<T = Record<string, ActorMethod>>(interfaceFactory: IDL.InterfaceFactory, configuration: ActorConfig): ActorSubclass<ActorMethodMappedWithHttpDetails<T>>;
    // TODO: we disabled this because it causes type errors.
    // two actors with matching types will not be equal because its a symbol
    // private [metadataSymbol];
    protected constructor(metadata: ActorMetadata);
}