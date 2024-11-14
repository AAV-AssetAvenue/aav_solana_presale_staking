use anchor_lang::prelude::*;

#[error_code]
pub enum OmertaError {
    #[msg("Can not mint more tokens")]
    CapExceed,
}
