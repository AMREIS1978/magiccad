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
