type DataRow=Record<string,any>
export function visibleMetric(node:DataRow,metric:string,isDemo:boolean,nowMs:number):DataRow|null {
 const row=node.latest?.find((r:DataRow)=>r.metric===metric)
 if(!row)return null
 if(metric==='methane'&&!isDemo){
  if(row.source==='SIMULATOR')return null
  const age=nowMs-Date.parse(row.collected_at)
  if(!Number.isFinite(age)||age< -60000||age>Math.max(6500,Number(node.report_seconds||30)*3000))return null
 }
 return row
}
export function methaneOrigin(node:DataRow,isDemo:boolean,nowMs:number):string {
 const row=visibleMetric(node,'methane',isDemo,nowMs)
 if(!row)return ''
 if(String(row.source).startsWith('ESP32_CH4_DEMO_'))return '主控上报'
 return row.source==='SIMULATOR'?'平台数据':'主控上报'
}
