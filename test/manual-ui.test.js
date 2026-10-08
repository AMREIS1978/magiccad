import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = new URL('../src/', import.meta.url);
test('operador: conversa por Enter, coordenadas, ORTHO, OSNAP, janela, zoom all e edição', async () => {
  const server = createServer(async (request, response) => {
    const name = request.url === '/' ? 'index.html' : request.url.slice(1);
    if (!['index.html','renderer.js','core.js','cad.js','assistant.js','learning.js','intent-model.js','style.css'].includes(name)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); response.end(await readFile(new URL(name, base)));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#ai-mode').click();
    for (const text of ['quero uma sala de 4x5','metros','20 cm']) { await page.locator('#command').fill(text); await page.locator('#command').press('Enter'); }
    assert.equal(await page.locator('#room-dialog').evaluate(e=>e.open),true);
    assert.equal(await page.locator('#room-width').inputValue(),'4'); assert.equal(await page.locator('#room-height').inputValue(),'5');
    await page.locator('#cancel-room').click(); await page.locator('#manual-mode').click();
    const command = async text => { await page.locator('#cad-input').fill(text); await page.locator('#cad-input').press('Enter'); };
    const screen = async (x,y) => page.locator('#canvas').evaluate((svg,p) => { const s=new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM()); return {x:s.x,y:s.y}; }, {x,y});
    const click = async (x,y,offset=0) => { const p=await screen(x,y); await page.mouse.click(p.x+offset,p.y); };
    await command('L'); await command('0,0'); await command('@4000,0'); await command('');
    assert.equal(await page.locator('.cad-line').count(),1);
    const line=page.locator('.cad-line').first(); assert.equal(await line.getAttribute('x2'),'4000'); assert.equal(await line.getAttribute('y2'),'0');
    // ORTHO constrains a deliberately off-axis pointer to the horizontal.
    await page.keyboard.press('F8'); await page.locator('#line').click(); await click(0,0); await click(2000,-1000); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.cad-line').count(),2); assert.equal(await page.locator('.cad-line').last().getAttribute('y2'),'0');
    await page.keyboard.press('F8'); await command('z a');
    // Endpoint OSNAP must restore the exact existing coordinate despite a 3 px offset.
    await page.locator('#line').click(); await click(4000,0,3); await click(4000,-1000); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.cad-line').last().getAttribute('x1'),'4000'); assert.equal(await page.locator('.cad-line').last().getAttribute('y1'),'0');
    const a=await screen(-100,-1100),b=await screen(4100,100);
    await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y,{steps:5}); await page.mouse.up();
    assert.equal(await page.locator('#entities .selected').count(),3); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#entities .selected').count(),0);
    // Grid snapping must not displace the fixed ORTHO coordinate by even 1 mm.
    await page.keyboard.press('F8'); await page.keyboard.press('F9'); await page.keyboard.press('F3');
    await command('L'); await command('1001,1001'); await click(3000,-1500); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.cad-line').last().getAttribute('y1'),'-1001'); assert.equal(await page.locator('.cad-line').last().getAttribute('y2'),'-1001');
    await command('U'); await page.keyboard.press('F8'); await page.keyboard.press('F9'); await page.keyboard.press('F3');
    await command('REC'); await command('900000,900000'); await command('910000,910000');
    assert.equal(await page.locator('.cad-line').count(),7);
    await command('Z'); await command('A');
    const canvas=await page.locator('#canvas').boundingBox();
    const boxes=await page.locator('.cad-line').evaluateAll(lines=>lines.map(line=>{const b=line.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};}));
    for(const b of boxes) { assert.ok(b.left>=canvas.x && b.right<=canvas.x+canvas.width); assert.ok(b.top>=canvas.y && b.bottom<=canvas.y+canvas.height); }
    await page.locator('#canvas').focus(); await page.keyboard.press('Control+a'); assert.equal(await page.locator('#entities .selected').count(),7);
    await command('M'); await command('0,0'); await command('@1000,2000');
    assert.equal(await page.locator('.cad-line').first().getAttribute('x1'),'1000'); assert.equal(await page.locator('.cad-line').first().getAttribute('y1'),'-2000');
    await page.locator('#cad-input').press('Control+z'); assert.equal(await page.locator('.cad-line').first().getAttribute('x1'),'0');
    await page.locator('#canvas').focus(); await page.keyboard.press('Control+a'); await command('E'); await command('');
    assert.equal(await page.locator('.cad-line').count(),0); await command('U'); assert.equal(await page.locator('.cad-line').count(),7);
    await command('Z A');
    const center = {x:canvas.x+canvas.width/2,y:canvas.y+canvas.height/2};
    const beforePan=await page.locator('#canvas').getAttribute('viewBox');
    await page.mouse.move(center.x,center.y); await page.mouse.down({button:'middle'}); await page.mouse.move(center.x+80,center.y+20); await page.mouse.up({button:'middle'});
    assert.notEqual(await page.locator('#canvas').getAttribute('viewBox'),beforePan);
    await page.mouse.click(center.x,center.y,{button:'middle'}); await page.mouse.click(center.x,center.y,{button:'middle'});
    assert.match(await page.locator('#status').textContent(),/ZOOM EXTENTS/);
    await page.locator('#canvas').focus(); await page.keyboard.press('Control+a');
    await page.locator('#copy').click(); await command('0,0'); await command('@2000,0');
    assert.equal(await page.locator('.cad-line').count(),14);
    assert.equal(await page.locator('.cad-line').nth(7).getAttribute('x1'),'2000');
    await command('U'); assert.equal(await page.locator('.cad-line').count(),7);
    await command('L'); await command('10000,0'); await command('14000,0'); await command('');
    await command('Z E'); await page.keyboard.press('Escape');
    await click(12000,0);
    await page.locator('#offset').click(); await command('20cm'); await command('10000,1000');
    assert.equal(await page.locator('.cad-line').last().getAttribute('y1'),'-200');
    assert.equal(await page.locator('.cad-line').last().getAttribute('y2'),'-200');
    await command('U'); assert.equal(await page.locator('.cad-line').count(),8);
    await command('Z E'); assert.deepEqual(errors,[]);
    // TRIM in the renderer: choose the clicked portion, preserve undo and selected boundaries.
    await page.locator('#canvas').focus(); await page.keyboard.press('Control+a'); await command('E'); await command('');
    for(const points of [['0,0','6000,0'],['2000,-1000','2000,1000'],['4000,-1000','4000,1000']]) {await command('L');for(const p of points) await command(p);await command('');}
    await command('Z E');await page.keyboard.press('Escape');await page.locator('#trim').click();await command('');await click(3000,0);
    assert.equal(await page.locator('.cad-line').count(),4);
    assert.equal(await page.locator('.cad-line').first().getAttribute('x2'),'2000');
    await command('U');assert.equal(await page.locator('.cad-line').count(),3);await command('');
    await click(2000,-500);await command('TR');await command('');await click(3000,0);
    assert.equal(await page.locator('.cad-line').first().getAttribute('x2'),'2000');await command('U');await command('');
    await command('Z A');await page.locator('#drawing-unit').selectOption('m');await command('L');await command('0,2');
    await page.keyboard.press('F8');const direction=await screen(1000,-2000);await page.mouse.move(direction.x,direction.y);await command('4');
    assert.equal(await page.locator('.cad-line').last().getAttribute('x2'),'4000');assert.equal(await page.locator('.cad-line').last().getAttribute('y2'),'-2000');
    await command('');await page.keyboard.press('F8');await page.locator('#drawing-unit').selectOption('mm');
    // Cooperative door conversation uses the current room and clickable short replies.
    await page.locator('#room-tool').click();await page.locator('#room-name').fill('Sala');await page.locator('#room-form button[type=submit]').click();
    await page.locator('#ai-mode').click();
    await page.locator('#messages .suggestions button').filter({hasText:'Inserir uma porta'}).last().click();
    for(const reply of ['90 cm','Parede superior','A 1 metro do canto','Dobradiça no fim']) await page.locator('#messages .suggestions button').filter({hasText:reply}).last().click();
    assert.equal(await page.locator('#door-dialog').evaluate(e=>e.open),true);
    assert.equal(await page.locator('#door-width').inputValue(),'0.9');assert.equal(await page.locator('#door-offset').inputValue(),'1');assert.equal(await page.locator('#door-wall').inputValue(),'north');
    await page.locator('#door-form button[type=submit]').click();assert.equal(await page.locator('.door-leaf').count(),1);
    const path=await page.locator('.wall').getAttribute('d');assert.equal((path.match(/M/g)||[]).length,3);
    await command('U');assert.equal(await page.locator('.door-leaf').count(),0);await command('REDO');assert.equal(await page.locator('.door-leaf').count(),1);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:'/workspace/magiccad-manual.png'});
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
});
