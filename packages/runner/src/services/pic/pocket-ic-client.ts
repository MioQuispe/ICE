import { Http2Client } from "./http2-client.js"
import {
	EncodedAddCyclesRequest,
	EncodedAddCyclesResponse,
	EncodedCanisterCallRequest,
	EncodedCanisterCallResponse,
	EncodedGetSubnetIdRequest,
	EncodedCreateInstanceRequest,
	CreateInstanceResponse,
	EncodedGetCyclesBalanceRequest,
	EncodedGetStableMemoryRequest,
	EncodedGetStableMemoryResponse,
	EncodedGetTimeResponse,
	EncodedSetTimeRequest,
	EncodedGetSubnetIdResponse,
	decodeGetTopologyResponse,
	InstanceTopology,
	GetStableMemoryRequest,
	encodeGetStableMemoryRequest,
	GetStableMemoryResponse,
	decodeGetStableMemoryResponse,
	SetStableMemoryRequest,
	encodeSetStableMemoryRequest,
	AddCyclesRequest,
	encodeAddCyclesRequest,
	AddCyclesResponse,
	decodeAddCyclesResponse,
	EncodedGetCyclesBalanceResponse,
	GetCyclesBalanceResponse,
	decodeGetCyclesBalanceResponse,
	encodeGetCyclesBalanceRequest,
	GetCyclesBalanceRequest,
	GetSubnetIdResponse,
	GetSubnetIdRequest,
	encodeGetSubnetIdRequest,
	decodeGetSubnetIdResponse,
	GetTimeResponse,
	decodeGetTimeResponse,
	SetTimeRequest,
	encodeSetTimeRequest,
	CanisterCallRequest,
	encodeCanisterCallRequest,
	CanisterCallResponse,
	decodeUploadBlobResponse,
	UploadBlobResponse,
	UploadBlobRequest,
	encodeUploadBlobRequest,
	CreateInstanceRequest,
	encodeCreateInstanceRequest,
	GetPubKeyRequest,
	EncodedGetPubKeyRequest,
	encodeGetPubKeyRequest,
	EncodedSetStableMemoryRequest,
	decodeCanisterCallResponse,
	EncodedGetPendingHttpsOutcallsResponse,
	GetPendingHttpsOutcallsResponse,
	decodeGetPendingHttpsOutcallsResponse,
	EncodedMockPendingHttpsOutcallRequest,
	encodeMockPendingHttpsOutcallRequest,
	MockPendingHttpsOutcallRequest,
	EncodedSubmitCanisterCallResponse,
	decodeSubmitCanisterCallResponse,
	SubmitCanisterCallResponse,
	SubmitCanisterCallRequest,
	encodeSubmitCanisterCallRequest,
	EncodedSubmitCanisterCallRequest,
	encodeAwaitCanisterCallRequest,
	AwaitCanisterCallRequest,
	EncodedAwaitCanisterCallRequest,
	AwaitCanisterCallResponse,
	EncodedAwaitCanisterCallResponse,
	decodeAwaitCanisterCallResponse,
	EncodedGetTopologyResponse,
	EncodedGetControllersRequest,
	EncodedGetControllersResponse,
	GetControllersRequest,
	GetControllersResponse,
	decodeGetControllersResponse,
	encodeGetControllersRequest,
	MakeLiveRequest,
	EncodedMakeLiveRequest,
	encodeMakeLiveRequest,
} from "./pocket-ic-client-types.js"

const PROCESSING_TIME_VALUE_MS = 30_000

export class PocketIcClient {
	private isInstanceDeleted = false

	private constructor(
		private readonly serverClient: Http2Client,
		private readonly instancePath: string,
	) {}

	public static async create(
		url: string,
		req?: CreateInstanceRequest,
	): Promise<PocketIcClient> {
		const processingTimeoutMs =
			req?.processingTimeoutMs ?? PROCESSING_TIME_VALUE_MS
		const serverClient = new Http2Client(url, processingTimeoutMs)

		let instanceId = 0
		const instances = await serverClient.jsonGet<Array<string>>({
			path: "/instances",
		})
		// TODO: instanceId might be more than +1 away from length
		if (instances.length === 0) {
			const res = await serverClient.jsonPost<
				EncodedCreateInstanceRequest,
				CreateInstanceResponse
			>({
				path: "/instances",
				body: encodeCreateInstanceRequest(req),
			})

			if ("Error" in res) {
				console.error("Error creating instance", res.Error.message)

				throw new Error(res.Error.message)
			}

			instanceId = res.Created.instance_id
		}
		return new PocketIcClient(serverClient, `/instances/${instanceId}`)
	}

	public async deleteInstance(): Promise<void> {
		this.assertInstanceNotDeleted()

		await this.serverClient.request({
			method: "DELETE",
			path: this.instancePath,
		})

		this.isInstanceDeleted = true
	}

	public async makeLive(req: MakeLiveRequest): Promise<void> {
		this.assertInstanceNotDeleted()
		await this.post<EncodedMakeLiveRequest, {}>(
			"/auto_progress",
			encodeMakeLiveRequest(req),
		)
	}

	public async getControllers(
		req: GetControllersRequest,
	): Promise<GetControllersResponse> {
		this.assertInstanceNotDeleted()

		const res = await this.post<
			EncodedGetControllersRequest,
			EncodedGetControllersResponse
		>("/read/get_controllers", encodeGetControllersRequest(req))

		return decodeGetControllersResponse(res)
	}

	public async tick(): Promise<{}> {
		this.assertInstanceNotDeleted()

		return await this.post<{}, {}>("/update/tick", {})
	}

	public async getPubKey(req: GetPubKeyRequest): Promise<Uint8Array> {
		this.assertInstanceNotDeleted()

		return await this.post<EncodedGetPubKeyRequest, Uint8Array>(
			"/read/pub_key",
			encodeGetPubKeyRequest(req),
		)
	}

	public async getTopology(): Promise<InstanceTopology> {
		this.assertInstanceNotDeleted()

		const res = await this.get<EncodedGetTopologyResponse>("/_/topology")

		return decodeGetTopologyResponse(res)
	}

	public async getTime(): Promise<GetTimeResponse> {
		this.assertInstanceNotDeleted()

		const res = await this.get<EncodedGetTimeResponse>("/read/get_time")

		return decodeGetTimeResponse(res)
	}

	public async setTime(req: SetTimeRequest): Promise<void> {
		this.assertInstanceNotDeleted()

		await this.post<EncodedSetTimeRequest, {}>(
			"/update/set_time",
			encodeSetTimeRequest(req),
		)
	}

	public async setCertifiedTime(req: SetTimeRequest): Promise<void> {
		this.assertInstanceNotDeleted()

		await this.post<EncodedSetTimeRequest, {}>(
			"/update/set_certified_time",
			encodeSetTimeRequest(req),
		)
	}

	public async getSubnetId(
		req: GetSubnetIdRequest,
	): Promise<GetSubnetIdResponse> {
		this.assertInstanceNotDeleted()

		const res = await this.post<
			EncodedGetSubnetIdRequest,
			EncodedGetSubnetIdResponse
		>("/read/get_subnet", encodeGetSubnetIdRequest(req))

		return decodeGetSubnetIdResponse(res)
	}

	public async getCyclesBalance(
		req: GetCyclesBalanceRequest,
	): Promise<GetCyclesBalanceResponse> {
		this.assertInstanceNotDeleted()

		const res = await this.post<
			EncodedGetCyclesBalanceRequest,
			EncodedGetCyclesBalanceResponse
		>("/read/get_cycles", encodeGetCyclesBalanceRequest(req))

		return decodeGetCyclesBalanceResponse(res)
	}

	public async addCycles(req: AddCyclesRequest): Promise<AddCyclesResponse> {
		this.assertInstanceNotDeleted()

		const res = await this.post<
			EncodedAddCyclesRequest,
			EncodedAddCyclesResponse
		>("/update/add_cycles", encodeAddCyclesRequest(req))

		return decodeAddCyclesResponse(res)
	}

	public async uploadBlob(req: UploadBlobRequest): Promise<UploadBlobResponse> {
		this.assertInstanceNotDeleted()

		const res = await this.serverClient.request({
			method: "POST",
			path: "/blobstore",
			body: encodeUploadBlobRequest(req),
		})

		const body = await res.text()
		return decodeUploadBlobResponse(body)
	}

	public async setStableMemory(req: SetStableMemoryRequest): Promise<void> {
		this.assertInstanceNotDeleted()

		await this.serverClient.jsonPost<EncodedSetStableMemoryRequest, {}>({
			path: `${this.instancePath}/update/set_stable_memory`,
			body: encodeSetStableMemoryRequest(req),
		})
	}

	public async getStableMemory(
		req: GetStableMemoryRequest,
	): Promise<GetStableMemoryResponse> {
		this.assertInstanceNotDeleted()

		const res = await this.post<
			EncodedGetStableMemoryRequest,
			EncodedGetStableMemoryResponse
		>("/read/get_stable_memory", encodeGetStableMemoryRequest(req))

		return decodeGetStableMemoryResponse(res)
	}

	public async getPendingHttpsOutcalls(): Promise<
		GetPendingHttpsOutcallsResponse[]
	> {
		this.assertInstanceNotDeleted()

		const res = await this.get<EncodedGetPendingHttpsOutcallsResponse[]>(
			"/read/get_canister_http",
		)

		return decodeGetPendingHttpsOutcallsResponse(res)
	}

	public async mockPendingHttpsOutcall(
		req: MockPendingHttpsOutcallRequest,
	): Promise<void> {
		this.assertInstanceNotDeleted()

		await this.post<EncodedMockPendingHttpsOutcallRequest, {}>(
			"/update/mock_canister_http",
			encodeMockPendingHttpsOutcallRequest(req),
		)
	}

	public async updateCall(
		req: CanisterCallRequest,
	): Promise<CanisterCallResponse> {
		this.assertInstanceNotDeleted()
		const res = await this.submitCall(req)
		return await this.awaitCall(res)
	}

	public async queryCall(
		req: CanisterCallRequest,
	): Promise<CanisterCallResponse> {
		this.assertInstanceNotDeleted()

		const res = await this.post<
			EncodedCanisterCallRequest,
			EncodedCanisterCallResponse
		>("/read/query", encodeCanisterCallRequest(req))

		return decodeCanisterCallResponse(res)
	}

	public async submitCall(
		req: SubmitCanisterCallRequest,
	): Promise<SubmitCanisterCallResponse> {
		this.assertInstanceNotDeleted()

		let res: EncodedSubmitCanisterCallResponse
		// TODO: this might cause issues if call fails for some other reason
		if (
			req.canisterId.toText() === "aaaaa-aa" &&
			req.method === "canister_status"
			// req.method === "install_code" ||
			// req.method === "install_chunked_code"
		) {
			res = await this.postNoPoll<
				EncodedSubmitCanisterCallRequest,
				EncodedSubmitCanisterCallResponse
			>("/update/submit_ingress_message", encodeSubmitCanisterCallRequest(req))
		} else {
			res = await this.post<
				EncodedSubmitCanisterCallRequest,
				EncodedSubmitCanisterCallResponse
			>("/update/submit_ingress_message", encodeSubmitCanisterCallRequest(req))
		}

		return decodeSubmitCanisterCallResponse(res)
	}

	public async awaitCall(
		req: AwaitCanisterCallRequest,
	): Promise<AwaitCanisterCallResponse> {
		this.assertInstanceNotDeleted()

		const res = await this.post<
			EncodedAwaitCanisterCallRequest,
			EncodedAwaitCanisterCallResponse
		>("/update/await_ingress_message", encodeAwaitCanisterCallRequest(req))

		return decodeAwaitCanisterCallResponse(res)
	}

	private async post<B, R extends {}>(endpoint: string, body?: B): Promise<R> {
		// @ts-ignore
		return await this.serverClient.jsonPost<B, R>({
			path: `${this.instancePath}${endpoint}`,
			body,
		})
	}

	private async postNoPoll<B, R extends {}>(
		endpoint: string,
		body?: B,
	): Promise<R> {
		// @ts-ignore
		return await this.serverClient.jsonPost<B, R>({
			path: `${this.instancePath}${endpoint}`,
			body,
		})
	}

	private async get<R extends {}>(endpoint: string): Promise<R> {
		return await this.serverClient.jsonGet<R>({
			path: `${this.instancePath}${endpoint}`,
		})
	}

	private assertInstanceNotDeleted(): void {
		if (this.isInstanceDeleted) {
			throw new Error("Instance was deleted")
		}
	}
}
