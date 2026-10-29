import { RAW_MAX_FILES } from './constants'
export const RAW_BATCH_BYTES=2*1024*1024
// Keep transport requests small even when the user selects twenty maximum-size files.
export function rawBatches<T>(items:T[],encode:(item:T)=>unknown=(item)=>item):T[][]{
 const batches:T[][]=[];let batch:T[]=[],bytes=32
 for(const item of items){
  const size=new TextEncoder().encode(JSON.stringify(encode(item))).length+1
  if(size+32>RAW_BATCH_BYTES)throw new Error('RAW_SIZE')
  if(batch.length && (batch.length>=RAW_MAX_FILES || bytes+size>RAW_BATCH_BYTES)){batches.push(batch);batch=[];bytes=32}
  batch.push(item);bytes+=size
 }
 if(batch.length)batches.push(batch)
 return batches
}
