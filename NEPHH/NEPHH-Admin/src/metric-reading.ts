import { assessSample, classifySource } from './source-status.ts'

type DataRow=Record<string,any>

function latestMetric(node:DataRow,metric:string):DataRow|null {
 return Array.isArray(node.latest)?node.latest.find((row:unknown)=>row!==null&&typeof row==='object'&&(row as DataRow).metric===metric)||null:null
}

/** Main readouts show only finite, time-confirmed and fresh values, including explicitly labelled simulations. */
export function visibleMetric(node:DataRow,metric:string,_isDemo:boolean,nowMs:number):DataRow|null {
 const row=latestMetric(node,metric)
 return assessSample(row,node.report_seconds,nowMs).state==='fresh'?row:null
}

/** Sample provenance remains meaningful when its value is stale or unavailable. */
export function methaneOrigin(node:DataRow,_isDemo:boolean,_nowMs:number):string {
 return classifySource(latestMetric(node,'methane')?.source).label
}
