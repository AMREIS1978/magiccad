import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalAssistant } from '../src/assistant.js';
import { train, predict } from '../src/learning.js';
import model from '../src/intent-model.js';
test('o treino aprende intenções a partir de exemplos rotulados', () => {
  const trained = train([{ intent: 'room', text: 'divisão sala quarto' }, { intent: 'stop', text: 'cancelar parar' }]);
  assert.equal(predict(trained, 'sala quarto').intent, 'room');
  assert.equal(predict(trained, 'parar cancelar').intent, 'stop');
  assert.equal(trained.examples, 2);
});
test('IA local aceita uma formulação fora da sintaxe dos comandos guiados', () => {
  const result = new LocalAssistant().interpret('Desenha uma sala de 4 por 5 metros, com paredes de 20 cm');
  assert.equal(result.type, 'room'); assert.equal(result.source, 'local-ml'); assert.equal(result.width, 4000); assert.equal(result.height, 5000); assert.equal(result.thickness, 200);
});
test('conversa pede a espessura em falta e retém medidas já indicadas', () => {
  const ai = new LocalAssistant();
  const first = ai.interpret('Preciso de um quarto de 3,5 x 4 m');
  assert.equal(first.type, 'clarification'); assert.match(first.message, /espessura/);
  const second = ai.interpret('paredes de 15 cm');
  assert.equal(second.type, 'room'); assert.equal(second.width, 3500); assert.equal(second.height, 4000); assert.equal(second.thickness, 150);
});
test('não inventa medidas nem executa uma tarefa fora das capacidades atuais', () => {
  const ai = new LocalAssistant();
  assert.equal(ai.interpret('calcula uma estrutura de betão').type, 'unsupported');
  assert.equal(ai.interpret('faz uma casa completa com escadas').type, 'unsupported');
  assert.throws(() => ai.interpret('desenha uma sala de 4,0001 por 5 metros com paredes de 20 cm'));
  ai.interpret('cria uma divisão de 4 x 5 metros'); ai.cancel();
  assert.equal(ai.pending, null);
});
test('avaliação de intenções em frases não presentes no conjunto de treino', () => {
  const heldOut = [
    ['desenha um escritório retangular', 'room'], ['quero uma cozinha retangular', 'room'],
    ['constrói uma sala com paredes', 'room'], ['cria um quarto com largura e comprimento', 'room'],
    ['desfazer o desenho', 'undo'], ['undo a alteração', 'undo'],
    ['refazer novamente', 'redo'], ['redo a alteração', 'redo'],
    ['cancelar o desenho', 'cancel'], ['parar a operação', 'cancel'],
    ['calcula o betão da estrutura', 'unknown'], ['aprova o licenciamento', 'unknown']
  ];
  const correct = heldOut.filter(([text, intent]) => predict(model, text).intent === intent).length;
  assert.equal(correct, heldOut.length, `${correct}/${heldOut.length} intenções reconhecidas. Este conjunto pequeno não mede qualidade arquitetónica.`);
});
test('unidades omitidas são esclarecidas sem perder as dimensões; resposta curta completa as paredes', () => {
  const ai = new LocalAssistant();
  assert.match(ai.interpret('quero uma sala de 4x5').message, /metros/);
  assert.equal(ai.interpret('metros').type, 'clarification');
  const room = ai.interpret('20 cm'); assert.equal(room.type, 'room'); assert.equal(room.width, 4000); assert.equal(room.height, 5000); assert.equal(room.thickness, 200);
});
test('aceita medidas por extenso e responde a ajuda e enquadramento', () => {
  const ai = new LocalAssistant();
  const room = ai.interpret('quero uma sala de quatro por cinco metros com paredes de vinte cm');
  assert.equal(room.type, 'room'); assert.equal(room.width, 4000); assert.equal(room.height, 5000);
  assert.equal(ai.interpret('bom dia').type, 'answer'); assert.equal(ai.interpret('mostra tudo').type, 'zoom-all');
});
test('revisão de dimensões sem unidades pede esclarecimento e nunca reutiliza medidas antigas', () => {
  const ai = new LocalAssistant(); ai.interpret('quero uma sala de 4x5 metros');
  assert.match(ai.interpret('afinal 6x7').message, /metros/); ai.interpret('metros');
  const result = ai.interpret('20 cm'); assert.equal(result.width,6000); assert.equal(result.height,7000);
  assert.throws(() => ai.interpret('quero uma sala de -4x5 metros com paredes de 20 cm'));
});

test('assistente coopera para inserir portas e usa a divisão selecionada', () => {
 const ai=new LocalAssistant(),context={rooms:[{id:'r',type:'room',name:'Sala',x:0,y:0,width:4000,height:5000,thickness:200}],selection:['r']};
 let response=ai.interpret('insere uma porta',context);assert.match(response.message,/Sala/);assert.ok(response.suggestions.includes('90 cm'));
 response=ai.interpret('90 cm',context);assert.match(response.message,/parede/);
 response=ai.interpret('parede superior',context);assert.match(response.message,/distância/);
 response=ai.interpret('0 m do canto',context);assert.match(response.message,/dobradiça/);
 response=ai.interpret('dobradiça no fim',context);assert.equal(response.type,'door');assert.equal(response.offset,0);assert.equal(response.width,900);assert.equal(response.hinge,'end');assert.equal(response.roomId,'r');
 assert.equal(ai.doorPending,null);
 response=ai.interpret('porta de 80 cm na parede direita a 1 metro do canto com dobradiça no início',context);
 assert.equal(response.type,'door');assert.equal(response.offset,1000);assert.equal(response.wall,'east');
 ai.interpret('porta',context);ai.interpret('cancelar',context);assert.equal(ai.doorPending,null);
 assert.equal(ai.interpret('inserir porta').type,'answer');assert.equal(ai.interpret('aparar linhas').command,'tr');
});
test('assistente pede a divisão quando há várias e não inventa uma escolha', () => {
 const ai=new LocalAssistant(),context={rooms:[{id:'r',type:'room',name:'Sala',x:0,y:0,width:4000,height:5000,thickness:200},{id:'s',type:'room',name:'Quarto',x:0,y:0,width:3000,height:4000,thickness:150}]};
 assert.match(ai.interpret('porta',context).message,/divisão/);
 assert.match(ai.interpret('Sala',context).message,/largura/);
});
