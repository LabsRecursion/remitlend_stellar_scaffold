#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, String};
use stellar_macros::default_impl;
use stellar_tokens::fungible::{Base, FungibleToken};

#[contract]
pub struct TestToken;

#[contractimpl]
impl TestToken {

    pub fn __constructor(e: &Env) {
        Base::set_metadata(e, 18, String::from_str(e, "TestToken"), String::from_str(e, "TTK"));
    }
    
    pub fn mint(e: &Env, account: Address, amount: i128) {
        Base::mint(e, &account, amount);
    }
}

#[default_impl]
#[contractimpl]
impl FungibleToken for TestToken {
    type ContractType = Base;

}