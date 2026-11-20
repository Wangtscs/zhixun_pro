import { chromium } from 'playwright';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5174');
 await page.getByPlaceholder('请输入用户名').fill('admin');
 await page.getByPlaceholder('请输入登录密码').fill('123456789012');
 await page.getByRole('button',{name:'登 录',exact:true}).click();
 await page.getByRole('heading',{name:'运行总览',exact:true}).waitFor();
 await page.locator('.work-map-node').first().waitFor();
 await page.screenshot({path:'../tmp/pdfs/workspace-desktop.png',fullPage:true});
 for(const name of ['节点与监测','告警中心','工单管理','巡检计划','处置手册','消息通知','统计报表','用户权限','操作审计']){
  await page.locator('.work-sidebar').getByRole('button',{name,exact:false}).click();
  await page.getByRole('heading',{name,exact:true,level:1}).waitFor();
 }
 await page.locator('.work-sidebar').getByRole('button',{name:'节点与监测',exact:true}).click();
 await page.getByRole('button',{name:'历史曲线',exact:true}).first().click();
 await page.locator('.work-dialog').getByRole('heading').waitFor();
 await page.locator('.work-dialog').getByRole('button',{name:'关闭',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'../tmp/pdfs/workspace-mobile.png',fullPage:true});
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({passed:true,pages:10,pageErrors:errors.length}));
}catch(e){console.log('PAGE',page.url(),await page.locator('body').innerText());await page.screenshot({path:'../tmp/pdfs/ui-failure.png'});throw e}finally{await browser.close()}
