import {appendFile, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {logger as appLogger} from '../infra/logger.js';
import type {ReplayEvent} from './dataset.js';

export interface ReplaySink { appendReplayEvent(event:ReplayEvent):Promise<void>; }
export interface ReplayLoggerOptions { path?:string | undefined; sink?:ReplaySink | undefined; }

export class ReplayLogger {
  constructor(private readonly options:ReplayLoggerOptions={}){}
  async record(event:ReplayEvent):Promise<void>{
    const line=JSON.stringify(event);
    appLogger.info({replay_event:event.event_type,event_id:event.event_id,trade_id:event.trade_id,timestamp_ms:event.timestamp_ms},'budsky_replay_event');
    if(this.options.path){await mkdir(dirname(this.options.path),{recursive:true});await appendFile(this.options.path,line+'\n','utf8');}
    if(this.options.sink)await this.options.sink.appendReplayEvent(event);
  }
}
