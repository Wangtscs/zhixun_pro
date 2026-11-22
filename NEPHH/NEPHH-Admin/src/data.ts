export const nodes = [
{id:'TN-A01',zone:'A区',location:'北入口',health:96,methane:12,temp:25.4,humidity:63,status:'在线'},
{id:'TN-A02',zone:'A区',location:'1号舱',health:92,methane:18,temp:26.8,humidity:66,status:'在线'},
{id:'TN-A03',zone:'A区',location:'2号舱',health:94,methane:16,temp:25.6,humidity:62,status:'在线'},
{id:'TN-A04',zone:'A区',location:'南出口',health:98,methane:9,temp:24.1,humidity:58,status:'在线'},
{id:'TN-B01',zone:'B区',location:'北入口',health:68,methane:42,temp:29.4,humidity:72,status:'告警'},
{id:'TN-B02',zone:'B区',location:'1号舱',health:91,methane:15,temp:25.9,humidity:65,status:'在线'},
{id:'TN-C01',zone:'C区',location:'检修口',health:0,methane:0,temp:0,humidity:0,status:'离线'},
{id:'TN-C02',zone:'C区',location:'南出口',health:93,methane:14,temp:26.1,humidity:61,status:'在线'}]
export const initialOrders = [
{id:'WO-250514-031',node:'TN-A03',risk:'高风险',status:'待派发',owner:'未分配',due:'今天 18:00'},
{id:'WO-250514-030',node:'TN-A02',risk:'高风险',status:'待接单',owner:'张伟',due:'30 分钟内'},
{id:'WO-250514-029',node:'TN-A02',risk:'中风险',status:'处理中',owner:'张伟',due:'今天 16:30'},
{id:'WO-250514-028',node:'TN-C01',risk:'中风险',status:'待接单',owner:'林舟',due:'今天 17:20'},
{id:'WO-250514-024',node:'TN-B01',risk:'中风险',status:'处理中',owner:'周宁',due:'今天 19:00'},
{id:'WO-250513-018',node:'TN-A04',risk:'低风险',status:'待复核',owner:'林舟',due:'明天 10:00'},
{id:'WO-250513-016',node:'TN-C02',risk:'低风险',status:'待派发',owner:'未分配',due:'明天 12:00'}]
export type Order = typeof initialOrders[number] & { notes?: string }
export type Sensor = typeof nodes[number]
