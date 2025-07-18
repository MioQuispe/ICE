use candid::TypeEnv;
use candid_parser::{check_prog, IDLProg};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn did_to_js(prog: String) -> Option<String> {
  let ast = prog.parse::<IDLProg>().ok()?;
  let mut env = TypeEnv::new();
  let actor = check_prog(&mut env, &ast).ok()?;
  Some(candid_parser::bindings::javascript::compile(&env, &actor))
}

#[wasm_bindgen]
pub fn did_to_ts(prog: String) -> Option<String> {
  let ast = prog.parse::<IDLProg>().ok()?;
  let mut env = TypeEnv::new();
  let actor = check_prog(&mut env, &ast).ok()?;
  Some(candid_parser::bindings::typescript::compile(&env, &actor))
}
