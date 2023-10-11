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
  const Result_4 = IDL.Variant({ 'Ok' : AppInfo, 'Err' : IDL.Text });
  const Result_5 = IDL.Variant({
    'Ok' : IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Principal))),
    'Err' : IDL.Text,
  });
  const CycleRecord = IDL.Record({ 'ts' : IDL.Nat64, 'balance' : IDL.Nat });
  const Result_6 = IDL.Variant({
    'Ok' : IDL.Vec(CycleRecord),
    'Err' : IDL.Text,
  });
  const CycleInfo = IDL.Record({
    'records' : IDL.Vec(CycleRecord),
    'estimate_remaining' : IDL.Nat64,
  });
  const Result_7 = IDL.Variant({ 'Ok' : CycleInfo, 'Err' : IDL.Text });
  const Result_8 = IDL.Variant({ 'Ok' : IDL.Bool, 'Err' : IDL.Text });
  const LogEntry = IDL.Record({
    'ts' : IDL.Nat64,
    'msg' : IDL.Text,
    'kind' : IDL.Text,
  });
  const Result_9 = IDL.Variant({ 'Ok' : IDL.Vec(LogEntry), 'Err' : IDL.Text });
  const Result_10 = IDL.Variant({
    'Ok' : IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Text))),
    'Err' : IDL.Text,
  });
  const Record = IDL.Record({
    'id' : IDL.Nat64,
    'create_at' : IDL.Nat64,
    'user' : IDL.Text,
    'event' : IDL.Text,
    'scope' : IDL.Text,
    'message' : IDL.Text,
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
  const Result_11 = IDL.Variant({
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
  const PlatformStatistics = IDL.Record({
    'user_count' : IDL.Nat64,
    'me_count' : IDL.Nat64,
    'nns_count' : IDL.Nat64,
    'device_count' : IDL.Nat64,
  });
  const UserGraph = IDL.Record({
    'me_count' : IDL.Nat64,
    'user_number' : IDL.Nat64,
    'nns_count' : IDL.Nat64,
    'device_count' : IDL.Nat64,
  });
  return IDL.Service({
    'add_records' : IDL.Func(
        [IDL.Text, IDL.Text, IDL.Text, IDL.Text],
        [IDL.Nat64],
        [],
      ),
    'backup_change_status' : IDL.Func([BackupStatus], [Result], []),
    'backup_info_get' : IDL.Func([], [Result_1], []),
    'backup_job_list' : IDL.Func([], [Result_2], []),
    'balance_get' : IDL.Func([], [Result_3], ['query']),
    'clear_records' : IDL.Func([IDL.Nat64], [IDL.Nat64], []),
    'clear_records_by_id' : IDL.Func([IDL.Nat64], [IDL.Nat64], []),
    'count_records' : IDL.Func([], [IDL.Nat64], ['query']),
    'ego_app_info_get' : IDL.Func([], [Result_4], ['query']),
    'ego_app_info_update' : IDL.Func(
        [IDL.Opt(IDL.Principal), IDL.Text, Version],
        [],
        [],
      ),
    'ego_app_version_check' : IDL.Func([], [Result_4], []),
    'ego_canister_add' : IDL.Func([IDL.Text, IDL.Principal], [Result], []),
    'ego_canister_delete' : IDL.Func([], [Result], []),
    'ego_canister_list' : IDL.Func([], [Result_5], []),
    'ego_canister_remove' : IDL.Func([IDL.Text, IDL.Principal], [Result], []),
    'ego_canister_track' : IDL.Func([], [Result], []),
    'ego_canister_untrack' : IDL.Func([], [Result], []),
    'ego_canister_upgrade' : IDL.Func([], [Result], []),
    'ego_controller_add' : IDL.Func([IDL.Principal], [Result], []),
    'ego_controller_remove' : IDL.Func([IDL.Principal], [Result], []),
    'ego_controller_set' : IDL.Func([IDL.Vec(IDL.Principal)], [Result], []),
    'ego_cycle_check' : IDL.Func([], [Result], []),
    'ego_cycle_estimate_set' : IDL.Func([IDL.Nat64], [Result], []),
    'ego_cycle_history' : IDL.Func([], [Result_6], []),
    'ego_cycle_info' : IDL.Func([], [Result_7], []),
    'ego_cycle_recharge' : IDL.Func([IDL.Nat], [Result], []),
    'ego_cycle_threshold_get' : IDL.Func([], [Result_3], []),
    'ego_is_op' : IDL.Func([], [Result_8], ['query']),
    'ego_is_owner' : IDL.Func([], [Result_8], ['query']),
    'ego_is_user' : IDL.Func([], [Result_8], ['query']),
    'ego_log_list' : IDL.Func([IDL.Nat64], [Result_9], ['query']),
    'ego_op_add' : IDL.Func([IDL.Principal], [Result], []),
    'ego_op_list' : IDL.Func([], [Result_10], []),
    'ego_op_remove' : IDL.Func([IDL.Principal], [Result], []),
    'ego_owner_add' : IDL.Func([IDL.Principal], [Result], []),
    'ego_owner_add_with_name' : IDL.Func(
        [IDL.Text, IDL.Principal],
        [Result],
        [],
      ),
    'ego_owner_list' : IDL.Func([], [Result_10], []),
    'ego_owner_remove' : IDL.Func([IDL.Principal], [Result], []),
    'ego_owner_set' : IDL.Func([IDL.Vec(IDL.Principal)], [Result], []),
    'ego_runtime_cycle_threshold_get' : IDL.Func([], [Result_3], []),
    'ego_user_add' : IDL.Func([IDL.Principal], [Result], []),
    'ego_user_list' : IDL.Func([], [Result_10], []),
    'ego_user_remove' : IDL.Func([IDL.Principal], [Result], []),
    'ego_user_set' : IDL.Func([IDL.Vec(IDL.Principal)], [Result], []),
    'finish_backup' : IDL.Func([], [], []),
    'finish_restore' : IDL.Func([], [], []),
    'get_records' : IDL.Func(
        [IDL.Opt(IDL.Text), IDL.Nat64, IDL.Nat64],
        [IDL.Vec(Record)],
        ['query'],
      ),
    'job_data_export' : IDL.Func(
        [
          IDL.Text,
          IDL.Nat64,
          IDL.Nat64,
          IDL.Opt(BackupExportFormat),
          IDL.Opt(IDL.Nat64),
        ],
        [Result_11],
        [],
      ),
    'job_data_import' : IDL.Func([ByteWriteRequest], [Result_8], []),
    'job_data_read' : IDL.Func(
        [IDL.Text, IDL.Nat64, IDL.Nat64],
        [Result_8],
        [],
      ),
    'job_data_write' : IDL.Func(
        [IDL.Text, IDL.Nat64, IDL.Nat64, IDL.Bool],
        [Result_8],
        [],
      ),
    'platform_statistics' : IDL.Func([], [PlatformStatistics], []),
    'start_backup' : IDL.Func([], [], []),
    'start_restore' : IDL.Func([IDL.Vec(BackupJob)], [], []),
    'users_statistics' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Text, UserGraph))],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return []; };
