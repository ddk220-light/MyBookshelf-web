import { createHash } from 'node:crypto';
import { AccountRequestError } from './security.js';

export const conflict = () => new AccountRequestError(409,'VERSION_CONFLICT','Your account changed on another device. Refresh and try again.');
export const invalid = (message) => new AccountRequestError(422,'INVALID_INPUT',message);
export function revision(value) {
  if(!Number.isSafeInteger(value)||value<0)throw invalid('Refresh your account and try again.');
  return value;
}
export function operationId(value) {
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw invalid('Use a fresh request identifier.');
  return value.toLowerCase();
}
function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
export const payloadHash=(value)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest();
export async function operation(client,userId,kind,body,run) {
  const id=operationId(body.operationId),hash=payloadHash({kind,...body});
  const prior=(await client.query('SELECT payload_hash,result,expires_at FROM account_operations WHERE user_id=$1 AND operation_id=$2',[userId,id])).rows[0];
  if(prior){
    if(!hash.equals(prior.payload_hash))throw new AccountRequestError(409,'OPERATION_CONFLICT','This request identifier was already used for a different change.');
    if(new Date(prior.expires_at)<=new Date())throw conflict();
    return prior.result;
  }
  const result=await run();
  await client.query('INSERT INTO account_operations(user_id,operation_id,payload_hash,result) VALUES($1,$2,$3,$4)',[userId,id,hash,result]);
  return result;
}
export function versions(settings) {
  return {settingsRevision:Number(settings.revision),shelfRevision:Number(settings.shelf_revision),historyGeneration:Number(settings.history_generation),historyEnabled:settings.history_enabled};
}
