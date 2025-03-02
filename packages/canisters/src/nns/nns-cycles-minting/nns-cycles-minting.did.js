export const idlFactory = ({ IDL }) => {
  const ExchangeRateCanister = IDL.Variant({
    'Set' : IDL.Principal,
    'Unset' : IDL.Null,
  });
  const AccountIdentifier = IDL.Record({ 'bytes' : IDL.Vec(IDL.Nat8) });
  const CyclesCanisterInitPayload = IDL.Record({
    'exchange_rate_canister' : IDL.Opt(ExchangeRateCanister),
    'last_purged_notification' : IDL.Opt(IDL.Nat64),
    'governance_canister_id' : IDL.Opt(IDL.Principal),
    'minting_account_id' : IDL.Opt(AccountIdentifier),
    'ledger_canister_id' : IDL.Opt(IDL.Principal),
  });
  const IcpXdrConversionRate = IDL.Record({
    'xdr_permyriad_per_icp' : IDL.Nat64,
    'timestamp_seconds' : IDL.Nat64,
  });
  const IcpXdrConversionRateResponse = IDL.Record({
    'certificate' : IDL.Vec(IDL.Nat8),
    'data' : IcpXdrConversionRate,
    'hash_tree' : IDL.Vec(IDL.Nat8),
  });
  const PrincipalsAuthorizedToCreateCanistersToSubnetsResponse = IDL.Record({
    'data' : IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Vec(IDL.Principal))),
  });
  const SubnetTypesToSubnetsResponse = IDL.Record({
    'data' : IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Principal))),
  });
  const BlockIndex = IDL.Nat64;
  const NotifyCreateCanisterArg = IDL.Record({
    'controller' : IDL.Principal,
    'block_index' : BlockIndex,
    'subnet_type' : IDL.Opt(IDL.Text),
  });
  const NotifyError = IDL.Variant({
    'Refunded' : IDL.Record({
      'block_index' : IDL.Opt(BlockIndex),
      'reason' : IDL.Text,
    }),
    'InvalidTransaction' : IDL.Text,
    'Other' : IDL.Record({
      'error_message' : IDL.Text,
      'error_code' : IDL.Nat64,
    }),
    'Processing' : IDL.Null,
    'TransactionTooOld' : BlockIndex,
  });
  const NotifyCreateCanisterResult = IDL.Variant({
    'Ok' : IDL.Principal,
    'Err' : NotifyError,
  });
  const NotifyTopUpArg = IDL.Record({
    'block_index' : BlockIndex,
    'canister_id' : IDL.Principal,
  });
  const Cycles = IDL.Nat;
  const NotifyTopUpResult = IDL.Variant({ 'Ok' : Cycles, 'Err' : NotifyError });
  return IDL.Service({
    'get_icp_xdr_conversion_rate' : IDL.Func(
        [],
        [IcpXdrConversionRateResponse],
        ['query'],
      ),
    'get_principals_authorized_to_create_canisters_to_subnets' : IDL.Func(
        [],
        [PrincipalsAuthorizedToCreateCanistersToSubnetsResponse],
        ['query'],
      ),
    'get_subnet_types_to_subnets' : IDL.Func(
        [],
        [SubnetTypesToSubnetsResponse],
        ['query'],
      ),
    'notify_create_canister' : IDL.Func(
        [NotifyCreateCanisterArg],
        [NotifyCreateCanisterResult],
        [],
      ),
    'notify_top_up' : IDL.Func([NotifyTopUpArg], [NotifyTopUpResult], []),
  });
};
export const init = ({ IDL }) => {
  const ExchangeRateCanister = IDL.Variant({
    'Set' : IDL.Principal,
    'Unset' : IDL.Null,
  });
  const AccountIdentifier = IDL.Record({ 'bytes' : IDL.Vec(IDL.Nat8) });
  const CyclesCanisterInitPayload = IDL.Record({
    'exchange_rate_canister' : IDL.Opt(ExchangeRateCanister),
    'last_purged_notification' : IDL.Opt(IDL.Nat64),
    'governance_canister_id' : IDL.Opt(IDL.Principal),
    'minting_account_id' : IDL.Opt(AccountIdentifier),
    'ledger_canister_id' : IDL.Opt(IDL.Principal),
  });
  return [IDL.Opt(CyclesCanisterInitPayload)];
};
