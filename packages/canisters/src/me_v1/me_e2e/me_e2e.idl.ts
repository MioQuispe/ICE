export const idlFactory = ({ IDL }) => {
  const BackupStatus = IDL.Variant({
    'MAINTAINING' : IDL.Null,
    'RUNNING' : IDL.Null,
  });
  const Result = IDL.Variant({ 'Ok' : IDL.Null, 'Err' : IDL.Text });
  const BackupInfo = IDL.Record({
    'state' : BackupStatus,
    'last_backup' : IDL.Nat64,
    'recent_backup' : IDL.Opt(IDL.Nat64),
  });
  const Result_1 = IDL.Variant({ 'Ok' : BackupInfo, 'Err' : IDL.Text });
  const BackupJob = IDL.Record({ 'name' : IDL.Text, 'amount' : IDL.Nat64 });
  const Result_2 = IDL.Variant({ 'Ok' : IDL.Vec(BackupJob), 'Err' : IDL.Text });
  const Result_3 = IDL.Variant({ 'Ok' : IDL.Nat, 'Err' : IDL.Text });
  const EncDoc = IDL.Record({
    'data' : IDL.Vec(IDL.Nat8),
    'meta' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'manager_pub_key' : IDL.Vec(IDL.Nat8),
  });
  const E2EDeviceRequest = IDL.Record({
    'meta' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'enc_doc' : IDL.Opt(EncDoc),
    'pub_key' : IDL.Vec(IDL.Nat8),
  });
  const MeError = IDL.Record({ 'msg' : IDL.Text, 'code' : IDL.Nat16 });
  const Result_4 = IDL.Variant({ 'Ok' : IDL.Null, 'Err' : MeError });
  const Result_5 = IDL.Variant({ 'Ok' : IDL.Bool, 'Err' : MeError });
  const MetaList = IDL.Record({
    'meta' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'pub_key' : IDL.Vec(IDL.Nat8),
  });
  const Version = IDL.Record({
    'major' : IDL.Nat32,
    'minor' : IDL.Nat32,
    'patch' : IDL.Nat32,
  });
  const AppInfo = IDL.Record({
    'app_id' : IDL.Text,
    'current_version' : Version,
    'latest_version' : Version,
    'wallet_id' : IDL.Opt(IDL.Principal),
  });
  const Result_6 = IDL.Variant({ 'Ok' : AppInfo, 'Err' : IDL.Text });
  const Result_7 = IDL.Variant({
    'Ok' : IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Principal))),
    'Err' : IDL.Text,
  });
  const CycleRecord = IDL.Record({ 'ts' : IDL.Nat64, 'balance' : IDL.Nat });
  const Result_8 = IDL.Variant({
    'Ok' : IDL.Vec(CycleRecord),
    'Err' : IDL.Text,
  });
  const CycleInfo = IDL.Record({
    'records' : IDL.Vec(CycleRecord),
    'estimate_remaining' : IDL.Nat64,
  });
  const Result_9 = IDL.Variant({ 'Ok' : CycleInfo, 'Err' : IDL.Text });
  const Result_10 = IDL.Variant({ 'Ok' : IDL.Bool, 'Err' : IDL.Text });
  const LogEntry = IDL.Record({
    'ts' : IDL.Nat64,
    'msg' : IDL.Text,
    'kind' : IDL.Text,
  });
  const Result_11 = IDL.Variant({ 'Ok' : IDL.Vec(LogEntry), 'Err' : IDL.Text });
  const Result_12 = IDL.Variant({
    'Ok' : IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Text))),
    'Err' : IDL.Text,
  });
  const BackupExportFormat = IDL.Variant({
    'JSON' : IDL.Null,
    'BINARY' : IDL.Null,
  });
  const ByteReadResponse = IDL.Record({
    'data' : IDL.Vec(IDL.Nat8),
    'hash' : IDL.Text,
    'name' : IDL.Text,
  });
  const Result_13 = IDL.Variant({
    'Ok' : IDL.Opt(ByteReadResponse),
    'Err' : IDL.Text,
  });
  const ByteWriteRequest = IDL.Record({
    'end' : IDL.Nat64,
    'data' : IDL.Vec(IDL.Nat8),
    'hash' : IDL.Text,
    'name' : IDL.Text,
    'start' : IDL.Nat64,
    'format' : IDL.Opt(BackupExportFormat),
  });
  return IDL.Service({
    'backup_change_status' : IDL.Func([BackupStatus], [Result], []),
    'backup_info_get' : IDL.Func([], [Result_1], []),
    'backup_job_list' : IDL.Func([], [Result_2], []),
    'balance_get' : IDL.Func([], [Result_3], ['query']),
    'device_main_add' : IDL.Func(
        [IDL.Text, IDL.Text, E2EDeviceRequest],
        [Result_4],
        [],
      ),
    'device_main_exists' : IDL.Func([IDL.Text, IDL.Principal], [Result_5], []),
    'device_main_get_doc' : IDL.Func([IDL.Text], [IDL.Opt(EncDoc)], ['query']),
    'device_main_get_meta_list' : IDL.Func(
        [IDL.Text],
        [IDL.Opt(IDL.Vec(MetaList))],
        ['query'],
      ),
    'device_main_manage_pub_key_exists' : IDL.Func(
        [IDL.Text, IDL.Vec(IDL.Nat8)],
        [Result_5],
        [],
      ),
    'device_main_remove' : IDL.Func(
        [IDL.Text, IDL.Text, IDL.Principal],
        [Result_4],
        [],
      ),
    'device_main_update_self' : IDL.Func(
        [IDL.Text, IDL.Principal, IDL.Opt(EncDoc), IDL.Opt(IDL.Vec(IDL.Nat8))],
        [Result_4],
        [],
      ),
    'ego_app_info_get' : IDL.Func([], [Result_6], ['query']),
    'ego_app_info_update' : IDL.Func(
        [IDL.Opt(IDL.Principal), IDL.Text, Version],
        [],
        [],
      ),
    'ego_app_version_check' : IDL.Func([], [Result_6], []),
    'ego_canister_add' : IDL.Func([IDL.Text, IDL.Principal], [Result], []),
    'ego_canister_delete' : IDL.Func([], [Result], []),
    'ego_canister_list' : IDL.Func([], [Result_7], []),
    'ego_canister_remove' : IDL.Func([IDL.Text, IDL.Principal], [Result], []),
    'ego_canister_track' : IDL.Func([], [Result], []),
    'ego_canister_untrack' : IDL.Func([], [Result], []),
    'ego_canister_upgrade' : IDL.Func([], [Result], []),
    'ego_controller_add' : IDL.Func([IDL.Principal], [Result], []),
    'ego_controller_remove' : IDL.Func([IDL.Principal], [Result], []),
    'ego_controller_set' : IDL.Func([IDL.Vec(IDL.Principal)], [Result], []),
    'ego_cycle_check' : IDL.Func([], [Result], []),
    'ego_cycle_estimate_set' : IDL.Func([IDL.Nat64], [Result], []),
    'ego_cycle_history' : IDL.Func([], [Result_8], []),
    'ego_cycle_info' : IDL.Func([], [Result_9], []),
    'ego_cycle_recharge' : IDL.Func([IDL.Nat], [Result], []),
    'ego_cycle_threshold_get' : IDL.Func([], [Result_3], []),
    'ego_is_op' : IDL.Func([], [Result_10], ['query']),
    'ego_is_owner' : IDL.Func([], [Result_10], ['query']),
    'ego_is_user' : IDL.Func([], [Result_10], ['query']),
    'ego_log_list' : IDL.Func([IDL.Nat64], [Result_11], ['query']),
    'ego_op_add' : IDL.Func([IDL.Principal], [Result], []),
    'ego_op_list' : IDL.Func([], [Result_12], []),
    'ego_op_remove' : IDL.Func([IDL.Principal], [Result], []),
    'ego_owner_add' : IDL.Func([IDL.Principal], [Result], []),
    'ego_owner_add_with_name' : IDL.Func(
        [IDL.Text, IDL.Principal],
        [Result],
        [],
      ),
    'ego_owner_list' : IDL.Func([], [Result_12], []),
    'ego_owner_remove' : IDL.Func([IDL.Principal], [Result], []),
    'ego_owner_set' : IDL.Func([IDL.Vec(IDL.Principal)], [Result], []),
    'ego_runtime_cycle_threshold_get' : IDL.Func([], [Result_3], []),
    'ego_user_add' : IDL.Func([IDL.Principal], [Result], []),
    'ego_user_list' : IDL.Func([], [Result_12], []),
    'ego_user_remove' : IDL.Func([IDL.Principal], [Result], []),
    'ego_user_set' : IDL.Func([IDL.Vec(IDL.Principal)], [Result], []),
    'finish_backup' : IDL.Func([], [], []),
    'finish_restore' : IDL.Func([], [], []),
    'job_data_export' : IDL.Func(
        [
          IDL.Text,
          IDL.Nat64,
          IDL.Nat64,
          IDL.Opt(BackupExportFormat),
          IDL.Opt(IDL.Nat64),
        ],
        [Result_13],
        [],
      ),
    'job_data_import' : IDL.Func([ByteWriteRequest], [Result_10], []),
    'job_data_read' : IDL.Func(
        [IDL.Text, IDL.Nat64, IDL.Nat64],
        [Result_10],
        [],
      ),
    'job_data_write' : IDL.Func(
        [IDL.Text, IDL.Nat64, IDL.Nat64, IDL.Bool],
        [Result_10],
        [],
      ),
    'start_backup' : IDL.Func([], [], []),
    'start_restore' : IDL.Func([IDL.Vec(BackupJob)], [], []),
  });
};
export const init = ({ IDL }) => { return []; };
